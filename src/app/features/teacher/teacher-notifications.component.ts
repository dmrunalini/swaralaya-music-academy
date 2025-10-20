import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationsService } from '../../core/services/notifications.service';

@Component({
  selector: 'app-teacher-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card">
      <h3>Contact messages</h3>

      <div class="pager" *ngIf="total > 0">
        <button class="btn" (click)="prev()" [disabled]="(page + 1) >= pages">Previous</button>
        <span class="muted">{{ startIndex+1 }}–{{ endIndex }} of {{ total }}</span>
        <button class="btn" (click)="next()" [disabled]="page === 0">Next</button>
      </div>

      <div *ngIf="pageItems.length === 0" class="muted">No messages yet.</div>

      <div *ngFor="let n of pageItems" class="row" (click)="open(n)" role="button" tabindex="0">
        <div class="col">
          <strong>{{ n.subject }}</strong>
          <div class="muted">{{ n.email }}</div>
        </div>
        <span class="badge" *ngIf="n.status!=='read'">New</span>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal" *ngIf="selected">
      <div class="backdrop" (click)="close()"></div>
      <div class="dialog">
        <div class="head">
          <h4>{{ selected?.subject }}</h4>
          <button class="icon" (click)="close()">✕</button>
        </div>
        <div class="meta muted">
          From: {{ selected?.name || 'Anonymous' }} • {{ selected?.email }}
        </div>
        <pre class="body">{{ selected?.message }}</pre>

        <!-- Reply box -->
        <div class="reply">
          <label class="muted">Reply</label>
          <textarea [(ngModel)]="replyText" rows="4" placeholder="Type your reply..."></textarea>
          <div class="actions">
            <button class="btn" (click)="sendReply()" [disabled]="!selected.email || !replyText.trim()">Send email</button>
            <button class="btn" (click)="markRead(selected)" [disabled]="selected?.status === 'read'">Mark read</button>
            <button class="btn ghost" (click)="close()">Close</button>
          </div>
          <div class="muted" style="margin-top:4px">Sending opens your default mail app addressed to the sender.</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .card{background:#fff;padding:12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.06);margin:12px 0}
    .row{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #eee;padding:10px 8px;cursor:pointer}
    .row:first-child{border-top:0}
    .muted{color:#64748b;font-size:12px}
    .btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 10px;cursor:pointer}
    .btn.ghost{background:transparent;color:#1f2937;border:1px solid #cbd5e1}
    .col{max-width:100%}
    .pager{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .badge{background:#16a34a;color:#fff;border-radius:999px;padding:2px 8px;font-size:12px;height:22px;align-self:center}
    .modal{position:fixed;inset:0;display:grid;place-items:center;z-index:1000}
    .backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45)}
    .dialog{position:relative;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);width:min(720px,92vw);max-height:85vh;display:grid;grid-template-rows:auto auto 1fr auto;overflow:hidden}
    .head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#f8fafc}
    .meta{padding:0 14px 8px}
    .body{margin:0;padding:12px 14px;white-space:pre-wrap}
    .reply{padding:12px 14px;display:grid;gap:6px}
    .reply textarea{padding:10px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical}
    .actions{display:flex;gap:8px;justify-content:flex-end}
    .icon{background:transparent;border:0;font-size:18px;cursor:pointer}
  `]
})
export class TeacherNotificationsComponent implements OnInit {
  private all: any[] = [];
  page = 0;
  pageSize = 4;
  selected: any | null = null;
  replyText = '';

  get total() { return this.all.length; }
  get pages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get startIndex() { return this.page * this.pageSize; }
  get endIndex() { return Math.min(this.startIndex + this.pageSize, this.total); }
  get pageItems() { return this.all.slice(this.startIndex, this.endIndex); }

  constructor(private svc: NotificationsService) {}

  ngOnInit() {
    this.svc.listContactAll().subscribe(v => {
      this.all = v || [];
      if (this.startIndex >= this.total) this.page = Math.max(0, this.pages - 1);
    });
  }

  // Newer (most recent) toward page 0
  next() { if (this.page > 0) this.page--; }
  // Older (past) toward higher pages
  prev() { if ((this.page + 1) < this.pages) this.page++; }

  open(n: any) {
    this.selected = n;
    this.replyText = `Hi ${n?.name || ''},\n\n`;
  }
  close() { this.selected = null; this.replyText = ''; }

  async markRead(n: any) {
    if (n?.id) {
      await this.svc.markRead(n.id);
      // reflect in UI
      if (this.selected?.id === n.id) this.selected.status = 'read';
      const found = this.all.find(x => x.id === n.id);
      if (found) found.status = 'read';
    }
  }

  sendReply() {
    if (!this.selected?.email) return;
    const subj = this.selected?.subject ? `Re: ${this.selected.subject}` : 'Re: Contact message';
    const body = this.replyText
      ? `${this.replyText}\n\n--- Original message ---\n${this.selected?.message || ''}`
      : (this.selected?.message || '');
    const href = `mailto:${encodeURIComponent(this.selected.email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
    window.open(href, '_blank');
  }
}