import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home-public',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    .wrap { max-width: 900px; margin: 24px auto; background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
    h1 { margin-top: 0; color: #0f172a; }
    ul { line-height: 1.6; }
  `],
  template: `
    <div class="wrap">
      <div [innerHTML]="content"></div>
    </div>
  `
})
export class HomePublicComponent implements OnInit {
  content = '<h1>Welcome to Swaralaya Music Academy</h1><p>Loading...</p>';
  constructor(private http: HttpClient) {}
  ngOnInit(): void {
    this.http.get('assets/content/public-home.html', { responseType: 'text' })
      .subscribe({
        next: html => this.content = html,
        error: () => this.content = '<h1>Welcome to Swaralaya Music Academy</h1><p>Public content coming soon.</p>'
      });
  }
}