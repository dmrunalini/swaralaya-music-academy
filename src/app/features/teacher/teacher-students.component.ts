import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import type { TeacherStudentListItem, StudentFee } from '../../core/services/auth.service';
import { AuthService, AppUser } from '../../core/services/auth.service';

@Component({
  selector: 'app-teacher-students',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styles: [`
    .wrap { max-width: 1000px; margin: 24px auto; }
    .card { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
    .title { margin: 0 0 12px; }
    .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 8px 0 16px; }
    .btn { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    .btn.ghost { background: transparent; color: #1f2937; border: 1px solid #cbd5e1; }
    .btn[disabled] { opacity: .5; cursor: not-allowed; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; vertical-align: middle; }
    .muted { color: #64748b; }
    .error { color: #b91c1c; }
    .badge { font-size: 11px; color: #065f46; background: #d1fae5; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 999px; }
    .badge.red { color: #7f1d1d; background: #fee2e2; border-color: #fecaca; }
  `],
  template: `
    <div class="wrap">
      <div class="card">
        <h2 class="title">All Students</h2>
        <div class="actions">
          <button class="btn" type="button" (click)="load()" [disabled]="busy">Refresh</button>
          <span class="muted">Month: {{ monthKey }}</span>
          <span class="error" *ngIf="error">{{ error }}</span>
        </div>

        <ng-container *ngIf="!busy; else loading">
          <table class="table" *ngIf="rows.length; else empty">
            <thead>
              <tr>
                <th>Student</th>
                <th>Age</th>
                <th>Current Month Fee</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of rows">
                <td>{{ s.firstName }} {{ s.lastName }}</td>
                <td>{{ s.age || '-' }}</td>
                <td>
                  <ng-container *ngIf="feeFor(s.id); else nofee">
                    <span>{{ feeFor(s.id)?.status | titlecase }}</span>
                    <span *ngIf="feeFor(s.id)?.teacherStatus === 'approved'" class="badge">Approved</span>
                    <span *ngIf="feeFor(s.id)?.teacherStatus === 'rejected'" class="badge red">Denied</span>
                  </ng-container>
                  <ng-template #nofee>
                    <span class="muted">No submission</span>
                  </ng-template>
                </td>
                <td>
                  <button class="btn" type="button"
                          (click)="approve(s.id!)"
                          [disabled]="!feeFor(s.id) || feeFor(s.id)?.teacherStatus === 'approved' || busyAction">
                    Approve
                  </button>
                  <button class="btn ghost" type="button"
                          (click)="deny(s.id!)"
                          [disabled]="!feeFor(s.id) || feeFor(s.id)?.teacherStatus === 'approved' || busyAction">
                    Deny
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <ng-template #empty>
            <p class="muted">No students found.</p>
          </ng-template>
        </ng-container>

        <ng-template #loading>
          <p class="muted">Loading…</p>
        </ng-template>
      </div>
    </div>
  `
})
export class TeacherStudentsComponent implements OnInit {
  user: AppUser | null = null;
  rows: TeacherStudentListItem[] = [];
  busy = false;
  busyAction = false;
  error = '';
  monthKey = this.currentMonthKey();
  private feeMap = new Map<string, StudentFee>(); // key: studentId

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.auth.user$.subscribe(u => {
      this.user = u;
      if (u?.role !== 'teacher') {
        this.router.navigate(['/login']);
        return;
      }
      this.load();
    });
  }

  async load() {
    if (!this.user) return;
    this.busy = true; this.error = '';
    try {
      this.rows = await this.auth.listAllStudentsForTeacher();
      await this.loadFees();
    } catch (e: any) {
      this.error = e?.message || 'Failed to load students';
      this.rows = [];
      this.feeMap.clear();
    } finally {
      this.busy = false;
    }
  }

  private async loadFees() {
    const fees = await this.auth.getMonthlyFeesForAllStudents(this.monthKey);
    this.feeMap = new Map(fees.map(f => [f.studentId, f]));
  }

  feeFor(studentId?: string) {
    return studentId ? this.feeMap.get(studentId) : undefined;
  }

  async approve(studentId: string) {
    const fee = this.feeFor(studentId);
    if (!fee?.id) return;
    this.busyAction = true;
    try {
      await this.auth.teacherSetFeeDecision(fee.id, 'approved');
      await this.loadFees();
    } finally {
      this.busyAction = false;
    }
  }

  async deny(studentId: string) {
    const fee = this.feeFor(studentId);
    if (!fee?.id) return;
    this.busyAction = true;
    try {
      await this.auth.teacherSetFeeDecision(fee.id, 'rejected');
      await this.loadFees();
    } finally {
      this.busyAction = false;
    }
  }

  private currentMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}