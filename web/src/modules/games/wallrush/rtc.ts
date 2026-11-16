// The phone camera streams straight to the TV over the home Wi-Fi (WebRTC). The server only passes
// the offer and the answer between them, each sent once with all its network routes in it.

/** No STUN server: phone and TV are on the same network, the local routes are enough */
export const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

/** Wait until the connection knows its network routes, so the description is complete (at most `ms`) */
export function gathered(pc: RTCPeerConnection, ms = 2500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const timer = setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/** Ask for a steady picture: a smooth frame rate matters more than sharpness for body tracking */
export async function tuneSender(sender: RTCRtpSender): Promise<void> {
  try {
    const p = sender.getParameters();
    p.encodings = p.encodings?.length ? p.encodings : [{}];
    p.encodings[0].maxBitrate = 3_000_000;
    p.encodings[0].maxFramerate = 30;
    (p as any).degradationPreference = 'maintain-framerate';
    await sender.setParameters(p);
  } catch {
    // Not every browser lets us tune it: the defaults work too
  }
}
