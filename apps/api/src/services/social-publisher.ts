// Social post publisher — dispatches to Meta Pages API or TikTok Content Posting API

import { db, decryptToken } from '@vigmis/db';

export interface PublishResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

const META_VERSION = 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

async function getMetaToken(tenantId: string): Promise<string> {
  const { data } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .eq('platform', 'meta')
    .single();
  if (!data) throw new Error('No Meta token');
  return decryptToken(data.access_token);
}

async function getPageConfig(tenantId: string, platform: 'facebook' | 'instagram'): Promise<{ pageId: string; token: string }> {
  const { data: settings } = await db
    .from('social_settings')
    .select('facebook_page_id, instagram_user_id, platforms')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // Prefer top-level fields, fall back to platforms array for backward compat
  let pageId: string | undefined;
  if (platform === 'facebook') {
    pageId = settings?.facebook_page_id ?? (settings?.platforms as any[])?.find((p: any) => p.platform === 'facebook')?.page_id;
  } else {
    pageId = settings?.instagram_user_id ?? (settings?.platforms as any[])?.find((p: any) => p.platform === 'instagram')?.page_id;
  }

  // No silent fallback. Auto-picking pages[0] led to publishing under the
  // user's personal Page instead of their actual business Page (Goodland incident).
  // Force an explicit selection via the Connect UI.
  if (!pageId) {
    throw new Error(
      platform === 'facebook'
        ? 'No Facebook Page selected for this account. Open Dashboard → Social → Connect → Facebook Page, and pick the Page Vigmis should publish to.'
        : 'No Instagram Business account selected. Open Dashboard → Social → Connect → Facebook Page, and pick a Page that has a linked Instagram Business account.'
    );
  }

  const userToken = await getMetaToken(tenantId);

  if (platform === 'facebook') {
    const pageRes = await fetch(`${META_BASE}/${pageId}?fields=access_token&access_token=${userToken}`);
    const pageData = await pageRes.json() as any;
    return { pageId, token: pageData.access_token ?? userToken };
  }

  return { pageId, token: userToken };
}

async function publishToFacebook(post: any): Promise<PublishResult> {
  const { pageId, token } = await getPageConfig(post.tenant_id, 'facebook');

  const content = post.client_edit?.trim() || post.content;
  const body: Record<string, string> = {
    message: content,
    access_token: token,
  };

  if (post.image_url) {
    // Photo post
    const res = await fetch(`${META_BASE}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, url: post.image_url, published: true }),
    });
    const data = await res.json() as any;
    if (data.error) return { success: false, error: data.error.message };
    return { success: true, externalId: data.post_id ?? data.id };
  }

  // Text-only post
  const res = await fetch(`${META_BASE}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (data.error) return { success: false, error: data.error.message };
  return { success: true, externalId: data.id };
}

async function publishToInstagram(post: any): Promise<PublishResult> {
  const { pageId: igUserId, token: userToken } = await getPageConfig(post.tenant_id, 'instagram');

  const content = post.client_edit?.trim() || post.content;
  const captionWithTags = post.hashtags?.length
    ? `${content}\n\n${(post.hashtags as string[]).map((t) => `#${t}`).join(' ')}`
    : content;

  if (!post.image_url) {
    // Instagram requires media — can't publish text-only
    return { success: false, error: 'Instagram post requires an image' };
  }

  // Step 1: Create media container
  const containerRes = await fetch(`${META_BASE}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: post.image_url,
      caption: captionWithTags,
      access_token: userToken,
    }),
  });
  const container = await containerRes.json() as any;
  if (container.error) return { success: false, error: container.error.message };

  // Step 2: Publish
  const publishRes = await fetch(`${META_BASE}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: userToken }),
  });
  const published = await publishRes.json() as any;
  if (published.error) return { success: false, error: published.error.message };
  return { success: true, externalId: published.id };
}

async function publishToTikTok(post: any): Promise<PublishResult> {
  // TikTok Content Posting API — Direct Post via FILE_UPLOAD
  // Uses FILE_UPLOAD (push_by_file) instead of PULL_FROM_URL so we don't need to
  // verify the video-hosting domain (videos live on Supabase, not vigmis.com).
  if (!post.video_url) {
    return { success: false, error: 'TikTok post requires a video (not yet generated)' };
  }

  const { data: tokenRow } = await db
    .from('platform_tokens')
    .select('access_token')
    .eq('tenant_id', post.tenant_id)
    .eq('platform', 'tiktok')
    .single();

  if (!tokenRow) return { success: false, error: 'No TikTok token' };
  const accessToken = decryptToken(tokenRow.access_token);

  const content = post.client_edit?.trim() || post.content;

  // Step 1: fetch the video bytes from wherever they're hosted (Supabase, etc.)
  const videoRes = await fetch(post.video_url);
  if (!videoRes.ok) {
    return { success: false, error: `Failed to fetch video bytes: ${videoRes.status}` };
  }
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const videoSize = videoBuffer.length;

  // TikTok requires chunk_size between 5MB and 64MB. For a single-chunk upload of
  // a video smaller than 5MB, chunk_size can equal video_size.
  const chunkSize = videoSize;
  const totalChunkCount = 1;

  // Step 2: init Direct Post with FILE_UPLOAD source
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: content.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });

  const initData = await initRes.json() as any;
  if (initData.error?.code && initData.error.code !== 'ok') {
    return { success: false, error: initData.error.message };
  }

  const uploadUrl = initData.data?.upload_url as string | undefined;
  const publishId = initData.data?.publish_id as string | undefined;
  if (!uploadUrl || !publishId) {
    return { success: false, error: 'TikTok init response missing upload_url or publish_id' };
  }

  // Step 3: PUT video bytes to the returned upload_url
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': videoSize.toString(),
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    return { success: false, error: `TikTok upload failed (${uploadRes.status}): ${errText}` };
  }

  return { success: true, externalId: publishId };
}

export async function publishSocialPost(post: any): Promise<PublishResult> {
  try {
    switch (post.platform) {
      case 'facebook':  return await publishToFacebook(post);
      case 'instagram': return await publishToInstagram(post);
      case 'tiktok':    return await publishToTikTok(post);
      default:          return { success: false, error: `Unknown platform: ${post.platform}` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}
