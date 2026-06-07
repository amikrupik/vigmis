import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { normalizeLocale, getMessages } from '../lib/i18n';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get('vigmis_lang')?.value);
  const messages = await getMessages(locale);
  return { locale, messages };
});
