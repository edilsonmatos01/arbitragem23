import Pusher from 'pusher';
import { NextResponse } from 'next/server';

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function POST(req: Request) {
  const data = await req.text();
  const [socketId, channelName] = data.split('&').map(str => str.split('=')[1]);

  // Basic auth for presence channels
  const authResponse = pusher.authorizeChannel(socketId, channelName);

  return new NextResponse(JSON.stringify(authResponse), { status: 200 });
} 