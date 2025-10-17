import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `<h2>About Swaralaya Music Academy</h2><p>Info...</p>`
})
export class AboutComponent {}