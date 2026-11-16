<script lang="ts">
  import { Camera, LoaderCircle, RefreshCw, SwitchCamera, TriangleAlert, Wifi } from '@lucide/svelte';
  import type { MatchState } from '$shared/games.ts';
  import type { WallRushSignal, WallRushView } from '$shared/wallrush.ts';
  import { onEvent, rpc } from '$lib/client.svelte.ts';
  import { RTC_CONFIG, gathered, tuneSender } from './rtc.ts';

  /**
   * The player's phone is the camera: it films them from a stand and streams to the TV over the
   * Wi-Fi. The screen stays on, with a small preview to aim it.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as WallRushView);

  const canStream = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  let preview = $state<HTMLVideoElement>();
  let facing = $state<'environment' | 'user'>('environment');
  let cam = $state<'off' | 'starting' | 'on' | 'error'>('off');
  let camError = $state('');
  let link = $state<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  let stream: MediaStream | null = null;
  let pc: RTCPeerConnection | null = null;
  let wake: WakeLockSentinel | null = null;

  async function startCamera() {
    stopCamera();
    cam = 'starting';
    camError = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      stream.getVideoTracks().forEach((t) => (t.contentHint = 'motion'));
      if (preview) {
        preview.srcObject = stream;
        await preview.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Wall Rush camera:', err);
      cam = 'error';
      camError = (err as Error)?.name === 'NotAllowedError' ? 'The camera was not allowed: allow it in the browser settings' : 'The camera could not start';
      return;
    }
    cam = 'on';
    void keepAwake();
    await connect();
  }

  function stopCamera() {
    pc?.close();
    pc = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    cam = 'off';
    link = 'idle';
  }

  /** Send the camera to the TV: an offer with all its routes, the TV answers through the server */
  async function connect() {
    if (!stream) return;
    pc?.close();
    const p = new RTCPeerConnection(RTC_CONFIG);
    pc = p;
    link = 'connecting';
    for (const track of stream.getVideoTracks()) void tuneSender(p.addTrack(track, stream));
    p.onconnectionstatechange = () => {
      if (pc !== p) return;
      if (p.connectionState === 'connected') link = 'connected';
      else if (p.connectionState === 'failed' || p.connectionState === 'disconnected') link = 'failed';
    };
    try {
      await p.setLocalDescription(await p.createOffer());
      await gathered(p);
      await rpc('games', 'play', { rtc: { kind: 'offer', sdp: p.localDescription!.sdp } });
    } catch {
      if (pc === p) link = 'failed';
    }
  }

  async function keepAwake() {
    try {
      wake = await navigator.wakeLock?.request('screen');
    } catch {
      // No wake lock: the phone may dim, the player can tap it
    }
  }

  $effect(() => {
    const off = onEvent<WallRushSignal>('games', 'wallrush:rtc', (sig) => {
      if (sig.kind === 'answer' && sig.sdp && pc && pc.signalingState === 'have-local-offer') {
        pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp }).catch(() => (link = 'failed'));
      } else if (sig.kind === 'hello' && stream) {
        void connect();
      }
    });
    // The wake lock goes when the page is hidden: take it again when it comes back
    const onVisible = () => document.visibilityState === 'visible' && cam === 'on' && void keepAwake();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
      stopCamera();
      void wake?.release().catch(() => {});
    };
  });

  function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    if (cam !== 'off') void startCamera();
  }

  const done = $derived(v.results.filter((r) => r !== null).length);
</script>

<div class="cam-phone">
  {#if !canStream}
    <div class="note bad">
      <TriangleAlert size={22} />
      <p>This page cannot use the camera. Open the party with its <strong>https</strong> link (scan the QR code on the TV) and try again.</p>
    </div>
  {:else}
    <div class="frame" class:live={cam === 'on'}>
      <video bind:this={preview} muted playsinline autoplay class:mirror={facing === 'user'}></video>
      {#if cam !== 'on'}
        <div class="over">
          {#if cam === 'starting'}<LoaderCircle class="spin" size={32} />{:else}<Camera size={36} />{/if}
        </div>
      {/if}
    </div>

    {#if cam === 'off' || cam === 'error'}
      <button class="btn primary block big" onclick={startCamera}><Camera size={20} /> Use this phone as the camera</button>
      {#if camError}<p class="error small">{camError}</p>{/if}
      <ul class="tips dim small">
        <li>Stand the phone up about 3 m away, at waist height, facing where you will play.</li>
        <li>Step back until the TV sees you from head to feet.</li>
        <li>Keep this page open: the phone streams to the TV over the Wi-Fi.</li>
      </ul>
    {:else}
      <div class="status">
        {#if link === 'connected'}
          <span class="ok"><Wifi size={18} /> Streaming to the TV</span>
        {:else if link === 'failed'}
          <span class="bad"><TriangleAlert size={18} /> No link to the TV. Same Wi-Fi as the TV?</span>
        {:else}
          <span class="dim"><LoaderCircle class="spin" size={18} /> Connecting to the TV</span>
        {/if}
      </div>
      <div class="row">
        <button class="btn ghost" onclick={flip}><SwitchCamera size={18} /> {facing === 'environment' ? 'Front camera' : 'Back camera'}</button>
        {#if link !== 'connected'}<button class="btn ghost" onclick={connect}><RefreshCw size={18} /> Reconnect</button>{/if}
      </div>
    {/if}

    {#if v.step === 'walls' || v.step === 'done'}
      <p class="score"><strong class="mono">{v.score}</strong> pts · wall {Math.min(done + 1, v.walls.length)}/{v.walls.length}</p>
    {:else if v.step === 'countdown'}
      <p class="score">Look at the TV!</p>
    {/if}
  {/if}
</div>

<style>
  .cam-phone {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    width: 100%;
  }
  .frame {
    position: relative;
    aspect-ratio: 3 / 4;
    max-height: 48vh;
    margin: 0 auto;
    width: 100%;
    border-radius: var(--radius, 1rem);
    overflow: hidden;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
  }
  .frame.live {
    border-color: var(--accent);
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  video.mirror {
    transform: scaleX(-1);
  }
  .over {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-dim, currentColor);
  }
  .big {
    padding: 0.95rem;
    font-size: 1.05rem;
  }
  .tips {
    margin: 0;
    padding-left: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .status span {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
  }
  .ok {
    color: var(--success, var(--accent));
  }
  .bad {
    color: var(--danger);
  }
  .row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .note {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
  }
  .note p {
    margin: 0;
  }
  .error {
    color: var(--danger);
    margin: 0;
  }
  .score {
    margin: 0;
    text-align: center;
    font-size: 1.1rem;
  }
  .score strong {
    font-size: 1.6rem;
  }
  .cam-phone :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
