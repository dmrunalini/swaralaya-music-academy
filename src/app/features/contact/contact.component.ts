import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationsService } from '../../core/services/notifications.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h2>Contact Us</h2>
    <form (ngSubmit)="submit()" #f="ngForm" class="form">
      <input class="input" name="name" [(ngModel)]="name" placeholder="Your name" required />
      <input class="input" type="email" name="email" [(ngModel)]="email" placeholder="Your email" required />
      <input class="input" name="subject" [(ngModel)]="subject" placeholder="Subject" required />
      <textarea class="input" name="message" [(ngModel)]="message" rows="5" placeholder="Message" required></textarea>
      <button class="btn" [disabled]="busy || !f.valid">Send</button>
      <span *ngIf="sent" class="ok">Sent! Our teachers will reach out.</span>
    </form>
  `,
  styles: [`
    .form { max-width: 560px; display: grid; gap: 8px; }
    .input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; }
    .btn { width: 120px; background:#2563eb; color:#fff; border:0; border-radius:8px; padding:8px 12px; cursor:pointer; }
    .ok { margin-left: 12px; color: #16a34a; }
  `]
})
export class ContactComponent {
  name = ''; email = ''; subject = ''; message = '';
  busy = false; sent = false;

  constructor(private notify: NotificationsService) {}

  async submit() {
    if (!this.name || !this.email || !this.subject || !this.message) return;
    this.busy = true; this.sent = false;
    try {
      await this.notify.sendContactMessage({ name: this.name, email: this.email, subject: this.subject, message: this.message });
      this.sent = true;
      this.name = this.email = this.subject = this.message = '';
    } finally { this.busy = false; }
  }
}