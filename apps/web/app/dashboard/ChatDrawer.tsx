// Compatibility shim — the real component now lives in app/components/ChatDrawer.tsx
// and is mounted globally via the root layout for every signed-in user.
export { default } from '../components/ChatDrawer';
export type { ExecutedAction } from '../components/chat-actions';
