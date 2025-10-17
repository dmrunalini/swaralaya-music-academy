import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService, AppUser, ChildStudent, StudentFee } from '../../core/services/auth.service';

type DashboardStudentItem = ChildStudent;

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  styles: [`
    .wrap { max-width: 900px; margin: 24px auto; }
    .card { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
    .title { margin: 0 0 12px; }
    .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 8px 0 16px; }
    .btn { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    .btn.ghost { background: transparent; color: #1f2937; border: 1px solid #cbd5e1; }
    .list { display: grid; gap: 10px; }
    .item { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .item h4 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .muted { color: #64748b; font-size: 12px; }
    .empty { color: #64748b; }
    .error { color: #b91c1c; }
    .badge { font-size: 11px; color: #1e3a8a; background: #dbeafe; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 999px; }
    .badge.red { color: #7f1d1d; background: #fee2e2; border-color: #fecaca; }
    .inline-form { display: grid; gap: 8px; padding: 10px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; }
    .inline-form label { display: flex; flex-direction: column; font-size: 12px; color: #334155; }
    .inline-form input, .inline-form select, .inline-form textarea {
      margin-top: 4px; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; background: #fff;
    }
    .inline-actions { display: flex; gap: 8px; }
  `],
  template: `
    <div class="wrap">
      <div class="card">
        <h2 class="title">Student Dashboard</h2>

        <div class="actions">
          <button class="btn" type="button" (click)="refresh()" [disabled]="busy">Refresh</button>
          <button class="btn ghost" type="button" (click)="addSelf()" [disabled]="busy || !user">Add myself as a student</button>
          <a class="btn ghost" routerLink="/profile">Manage students in Profile</a>
          <span class="error" *ngIf="error">{{ error }}</span>
        </div>

        <ng-container *ngIf="!busy; else loading">
          <div class="list" *ngIf="students.length; else empty">
            <div class="item" *ngFor="let s of students">
              <div class="row">
                <div>
                  <h4>
                    {{ s.firstName }} {{ s.lastName }}
                    <span *ngIf="s.isSelf" class="badge">Self</span>
                  </h4>
                  <div class="muted">
                    <span *ngIf="!s.isSelf && s.age">Age: {{ s.age }} • </span>
                    <span *ngIf="s.level">Level: {{ s.level }} • </span>
                    <span *ngIf="s.assignedTeacherEmail">Teacher: {{ s.assignedTeacherEmail }}</span>
                  </div>
                  <div class="muted">
                    <ng-container *ngIf="feeFor(s.id!) as fee; else nofee">
                      Fee ({{ monthKey }}): {{ fee.status | titlecase }}
                      <span *ngIf="fee.teacherStatus === 'approved'" class="badge">Approved</span>
                      <span *ngIf="fee.teacherStatus === 'rejected'" class="badge red">Denied</span>
                      <span *ngIf="!fee.teacherStatus || fee.teacherStatus === 'pending'"> • Awaiting teacher review</span>
                    </ng-container>
                    <ng-template #nofee>
                      Fee ({{ monthKey }}): Not submitted
                    </ng-template>
                  </div>
                </div>

                <div>
                  <select [ngModel]="getActionFor(s.id!)" (ngModelChange)="onActionChange(s, $event)">
                    <option value="">Actions…</option>
                    <option value="cancel">Request cancellation</option>
                    <option value="reschedule">Request reschedule</option>
                    <option value="fee" [disabled]="isFeeLocked(s)">Submit fee status (this month)</option>
                  </select>
                </div>
              </div>

              <!-- Fee inline form -->
              <div class="inline-form" *ngIf="isActive(s.id!, 'fee')">
                <div class="muted" *ngIf="isFeeLocked(s)">This month's fee is approved by your teacher. Further changes are disabled.</div>
                <label>
                  Status
                  <select [(ngModel)]="feeStatus" [disabled]="isFeeLocked(s)">
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                  </select>
                </label>
                <label>
                  Amount (optional)
                  <input type="number" min="0" step="0.01" [(ngModel)]="feeAmount" [disabled]="isFeeLocked(s)" />
                </label>
                <label>
                  Note (optional)
                  <textarea rows="2" [(ngModel)]="feeNote" placeholder="Any note for this month" [disabled]="isFeeLocked(s)"></textarea>
                </label>
                <div class="inline-actions">
                  <button class="btn" type="button" (click)="submitFee(s)" [disabled]="busySubmit || isFeeLocked(s)">Submit</button>
                  <button class="btn ghost" type="button" (click)="clearAction()">Close</button>
                </div>
              </div>
              <!-- ...existing code... -->
            </div>
          </div>
          <ng-template #empty>
            <p class="empty">No students linked yet. Add your child or yourself to get started.</p>
          </ng-template>
        </ng-container>

        <ng-template #loading>
          <p class="muted">Loading students…</p>
        </ng-template>
      </div>
    </div>
  `
})
export class StudentDashboardComponent implements OnInit {
  user: AppUser | null = null;
  students: ChildStudent[] = [];
  busy = false;
  error = '';

  // dropdown/inline form state
  activeStudentId: string | null = null;
  activeAction: 'cancel' | 'reschedule' | 'fee' | null = null;
  cancelReason = '';
  rescheduleDate = '';
  rescheduleTime = '';
  rescheduleReason = '';
  feeStatus: 'paid' | 'pending' | 'partial' = 'paid';
  feeAmount: number | null = null;
  feeNote = '';
  busySubmit = false;

  // fees
  monthKey = this.currentMonthKey();
  private feeMap = new Map<string, StudentFee>();
  private stopFees?: () => void;

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    this.auth.user$.subscribe(u => {
      this.user = u;
      this.refresh();
    });
  }

  async refresh() {
    if (!this.user) {
      this.students = [];
      this.feeMap.clear();
      this.stopFees?.(); this.stopFees = undefined;
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      this.students = await this.auth.listChildStudents(this.user.uid);
      this.students.sort((a, b) => Number(!!b.isSelf) - Number(!!a.isSelf));

      // Start/restart realtime fees listener
      this.stopFees?.();
      this.stopFees = this.auth.observeMonthlyFeesForParent(this.user.uid, this.monthKey, fees => {
        this.feeMap = new Map(fees.map(f => [f.studentId, f]));
        // If currently viewing fee form and it just got approved, close it
        if (this.activeAction === 'fee' && this.activeStudentId) {
          const cur = this.feeFor(this.activeStudentId);
          if (cur && (cur.locked || cur.teacherStatus === 'approved')) {
            this.clearAction();
          }
        }
      });
    } catch (e: any) {
      this.error = e?.message || 'Failed to load students';
      this.students = [];
      this.feeMap.clear();
      this.stopFees?.(); this.stopFees = undefined;
    } finally {
      this.busy = false;
    }
  }

  private async loadFees() {
    if (!this.user) return;
    const fees = await this.auth.getMonthlyFeesForParent(this.user.uid, this.monthKey);
    this.feeMap = new Map(fees.map(f => [f.studentId, f]));
  }

  feeFor(studentId: string) {
    return this.feeMap.get(studentId);
  }

  isFeeLocked(s: ChildStudent): boolean {
    const fee = s.id ? this.feeFor(s.id) : undefined;
    return !!(fee && (fee.locked || fee.teacherStatus === 'approved'));
  }

  async addSelf() {
    if (!this.user) return;
    this.busy = true;
    try {
      await this.auth.ensureSelfStudent(this.user.uid);
      await this.refresh();
    } finally {
      this.busy = false;
    }
  }

  // Dropdown helpers
  getActionFor(id: string) { return this.activeStudentId === id ? this.activeAction || '' : ''; }
  isActive(id: string, action: 'cancel' | 'reschedule' | 'fee') { return this.activeStudentId === id && this.activeAction === action; }
  onActionChange(s: ChildStudent, action: string) {
    if (!action) { this.clearAction(); return; }
    // Block fee form if approved/locked
    if (action === 'fee' && this.isFeeLocked(s)) {
      this.clearAction();
      return;
    }
    this.activeStudentId = s.id || null;
    this.activeAction = action as any;
    // reset fields
    this.cancelReason = '';
    this.rescheduleDate = '';
    this.rescheduleTime = '';
    this.rescheduleReason = '';
    this.feeStatus = 'paid';
    this.feeAmount = null;
    this.feeNote = '';
  }
  clearAction() { this.activeStudentId = null; this.activeAction = null; }

  // Submissions
  async submitCancel(s: ChildStudent) {
    if (!this.user || !s.id) return;
    this.busySubmit = true;
    try {
      await this.auth.createStudentRequest(this.user.uid, s, { kind: 'cancel', reason: this.cancelReason?.trim() || undefined });
      this.clearAction();
      await this.refresh();
    } finally {
      this.busySubmit = false;
    }
  }

  async submitReschedule(s: ChildStudent) {
    if (!this.user || !s.id) return;
    this.busySubmit = true;
    try {
      await this.auth.createStudentRequest(this.user.uid, s, {
        kind: 'reschedule',
        reason: this.rescheduleReason?.trim() || undefined,
        preferredDate: this.rescheduleDate || undefined,
        preferredTime: this.rescheduleTime || undefined
      });
      this.clearAction();
      await this.refresh();
    } finally {
      this.busySubmit = false;
    }
  }

  async submitFee(s: ChildStudent) {
    if (!this.user || !s.id || this.isFeeLocked(s)) return;
    this.busySubmit = true;
    try {
      await this.auth.submitMonthlyFeeStatus(this.user.uid, s, {
        monthKey: this.monthKey,
        status: this.feeStatus,
        amount: this.feeAmount ?? undefined,
        note: this.feeNote?.trim() || undefined
      });
      this.clearAction();
      await this.loadFees(); // refresh fee status to reflect teacherStatus: pending
    } finally {
      this.busySubmit = false;
    }
  }

  private currentMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}