import ZoomVideo from '@zoom/videosdk';

export const client = ZoomVideo.createClient();

client.init('en-US', 'CDN');

export const joinSession = (nickname: string, jwt: string) =>
  client.join(import.meta.env.VITE_ZOOM_SESSION_NAME, jwt, nickname);
