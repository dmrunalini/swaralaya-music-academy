import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, addDoc, onSnapshot, deleteDoc
} from 'firebase/firestore';

@Component({
  selector: 'app-video-session',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wrap">
      <h2>Class Video</h2>
      <div class="videos">
        <video #local autoplay playsinline muted></video>
        <video #remote autoplay playsinline></video>
      </div>

      <div class="controls">
        <button (click)="joinOrCreate()" [disabled]="busy || connected">Join session</button>
        <button (click)="toggleMic()" [disabled]="!connected">{{ micOn ? 'Mute' : 'Unmute' }}</button>
        <button (click)="toggleCam()" [disabled]="!connected">{{ camOn ? 'Stop Cam' : 'Start Cam' }}</button>
        <button (click)="hangup()" [disabled]="!connected">Hang up</button>
      </div>

      <div class="hint">Both teacher and student click “Join session” for the same class to connect.</div>
    </div>
  `,
  styles: [`
    .wrap { padding: 12px; }
    .videos { display:flex; gap:8px; flex-wrap:wrap }
    video { background:#000; width: min(480px, 46vw); height: 270px; border-radius: 8px }
    .controls { display:flex; gap:8px; margin-top:8px }
    button { padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; cursor:pointer }
    .hint { margin-top:8px; color:#64748b; font-size:12px }
  `]
})
export class VideoSessionComponent implements OnInit, OnDestroy {
  private db = getFirestore();
  private pc?: RTCPeerConnection;
  private localStream?: MediaStream;
  private remoteStream?: MediaStream;
  private unsubRoom?: () => void;
  private unsubCaller?: () => void;
  private unsubCallee?: () => void;

  roomId = '';
  busy = false;
  connected = false;
  micOn = true;
  camOn = true;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';
  }

  ngOnDestroy(): void { this.hangup(); }

  async joinOrCreate() {
    if (!this.roomId) return;
    this.busy = true;
    try {
      // Media
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.remoteStream = new MediaStream();
      // Bind videos
      const localEl = document.querySelector('video#local') as HTMLVideoElement ?? document.querySelector('video');
      const videos = document.querySelectorAll('video');
      const remoteEl = videos.length > 1 ? (videos[1] as HTMLVideoElement) : undefined;
      if (localEl) localEl.srcObject = this.localStream;
      if (remoteEl) remoteEl.srcObject = this.remoteStream;

      // Peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
      });
      this.pc.oniceconnectionstatechange = () => {
        this.connected = ['connected', 'completed'].includes(this.pc?.iceConnectionState || '');
      };
      this.pc.ontrack = (e) => e.streams[0].getTracks().forEach(t => this.remoteStream!.addTrack(t));
      this.localStream.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));

      const roomRef = doc(this.db, 'rtcRooms', this.roomId);
      const snap = await getDoc(roomRef);

      if (!snap.exists()) {
        // Create (teacher or first joiner)
        await setDoc(roomRef, { createdAt: Date.now() });

        // ICE from caller
        this.pc.onicecandidate = async (ev) => {
          if (ev.candidate) {
            await addDoc(collection(roomRef, 'callerCandidates'), ev.candidate.toJSON());
          }
        };

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await updateDoc(roomRef, { offer: JSON.parse(JSON.stringify(offer)) });

        // Listen for answer
        this.unsubRoom = onSnapshot(roomRef, async (docSnap) => {
          const data = docSnap.data() as any;
          if (data?.answer && this.pc && !this.pc.currentRemoteDescription) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
        });

        // Listen for callee ICE
        this.unsubCallee = onSnapshot(collection(roomRef, 'calleeCandidates'), async (qs) => {
          for (const d of qs.docChanges()) {
            if (d.type === 'added') {
              try { await this.pc!.addIceCandidate(new RTCIceCandidate(d.doc.data() as RTCIceCandidateInit)); } catch {}
            }
          }
        });

      } else {
        // Join (student or second joiner)
        // ICE from callee
        this.pc.onicecandidate = async (ev) => {
          if (ev.candidate) {
            await addDoc(collection(roomRef, 'calleeCandidates'), ev.candidate.toJSON());
          }
        };

        this.unsubRoom = onSnapshot(roomRef, async (docSnap) => {
          const data = docSnap.data() as any;
          if (data?.offer && this.pc && !this.pc.currentRemoteDescription) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await updateDoc(roomRef, { answer: JSON.parse(JSON.stringify(answer)) });
          }
        });

        // Listen for caller ICE
        this.unsubCaller = onSnapshot(collection(roomRef, 'callerCandidates'), async (qs) => {
          for (const d of qs.docChanges()) {
            if (d.type === 'added') {
              try { await this.pc!.addIceCandidate(new RTCIceCandidate(d.doc.data() as RTCIceCandidateInit)); } catch {}
            }
          }
        });
      }
    } finally {
      this.busy = false;
    }
  }

  toggleMic() {
    if (!this.localStream) return;
    this.micOn = !this.micOn;
    this.localStream.getAudioTracks().forEach(t => t.enabled = this.micOn);
  }

  toggleCam() {
    if (!this.localStream) return;
    this.camOn = !this.camOn;
    this.localStream.getVideoTracks().forEach(t => t.enabled = this.camOn);
  }

  async hangup() {
    try {
      this.unsubRoom?.(); this.unsubCaller?.(); this.unsubCallee?.();
    } catch {}
    try { this.pc?.close(); } catch {}
    this.pc = undefined;
    this.connected = false;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.remoteStream?.getTracks().forEach(t => t.stop());
  }
}