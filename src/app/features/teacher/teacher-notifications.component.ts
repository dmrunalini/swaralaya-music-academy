import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationsService } from '../../core/services/notifications.service';

@Component({
  selector: 'app-teacher-notifications',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <h3>Contact messages</h3>
      <div *ngIf="items.length === 0" class="muted">No messages yet.</div>
      <div *ngFor="let n of items" class="row">
        <div class="col">
          <strong>{{ n.subject }}</strong>
          <div class="muted">{{ n.name }} • {{ n.email }}</div>
          <div>{{ n.message }}</div>
        </div>
        <button class="btn" (click)="mark(n)" *ngIf="n.status!=='read'">Mark read</button>
      </div>
    </div>
  `,
  styles: [`
    .card{background:#fff;padding:12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.06);margin:12px 0}
    .row{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #eee;padding:8px 0}
    .row:first-child{border-top:0}
    .muted{color:#64748b;font-size:12px}
    .btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 10px;cursor:pointer}
    .col{max-width:100%}
  `]
})
export class TeacherNotificationsComponent implements OnInit {
  items: any[] = [];
  constructor(private svc: NotificationsService) {}
  ngOnInit() {
    this.svc.listContactNew(20).subscribe(v => this.items = v);
  }
  mark(n: any) { if (n?.id) this.svc.markRead(n.id); }
}