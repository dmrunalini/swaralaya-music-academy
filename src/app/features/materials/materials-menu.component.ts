import { Component, OnInit } from '@angular/core';
import { MaterialsService } from '../../core/services/materials.service';
import { AuthService, AppUser } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-materials-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './materials-menu.component.html',
  styleUrls: ['./materials-menu.component.scss']
})
export class MaterialsMenuComponent implements OnInit {
  categories: string[] = [];
  selectedCategory: string | null = null;
  materials: any[] = [];
  isTeacher = false;
  user: AppUser | null = null;

  // new category / material form
  newCategoryName = '';
  newMaterialTitle = '';
  newMaterialContent = '';
  newMaterialFile: File | null = null;

  constructor(private materialsService: MaterialsService, private auth: AuthService) {}

  ngOnInit(): void {
    this.auth.user$.subscribe(u => {
      this.user = u;
      this.isTeacher = !!(u && u.role === 'teacher');
      if (u) {
        this.bindCategories();
        this.loadMaterials();
      } else {
        this.categories = [];
        this.materials = [];
      }
    });

    this.selectedCategory = null;
  }

  private bindCategories() {
    this.materialsService.getCategories().subscribe(cats => {
      this.categories = (cats || []).filter(c => c !== 'All Materials');
    });
  }

  loadMaterials() {
    const categoryFilter = this.selectedCategory || undefined;
    this.materialsService.getMaterialsByCategory(categoryFilter).subscribe(ms => {
      this.materials = (ms || []).filter(m => !(m.title || '').startsWith('__category__'));
    });
  }

  // Editing state
  private editingId: string | null = null;
  editBuffer: any = {};

  // Modal viewer/editor state
  modalOpen = false;
  modalEditable = false;
  modalMaterial: any = null;
  modalUrl: string | null = null;
  modalText = '';
  modalCategory: string | null = null;
  modalTitle = '';

  // Create popup state
  createPopupOpen: 'category' | 'material' | null = null;

  openCreatePopup(kind: 'category' | 'material') { this.createPopupOpen = kind; }
  closeCreatePopup() {
    this.createPopupOpen = null;
    this.newCategoryName = '';
    this.newMaterialTitle = '';
    this.newMaterialContent = '';
    this.newMaterialFile = null;
  }

  async createCategoryFromPopup() {
    if (!this.isTeacher) return;
    try {
      await this.createCategory();
      this.closeCreatePopup();
    } catch (e: any) {
      console.error('Create category failed:', e);
      alert('Create category failed: ' + (e?.message || e));
    }
  }
  async createMaterialFromPopup() {
    if (!this.isTeacher) return;
    await this.createMaterial();
    this.closeCreatePopup();
  }

  isEditing(id: string) { return this.editingId === id; }
  startEdit(m: any) {
    this.editingId = m.id;
    this.editBuffer = { title: m.title, content: m.content, category: m.category };
  }
  cancelEdit() { this.editingId = null; this.editBuffer = {}; }

  async saveEdit(m: any) {
    if (!this.isTeacher || !this.editingId) return;
    const data: any = {};
    if (this.editBuffer.title !== undefined) data.title = this.editBuffer.title;
    if (this.editBuffer.content !== undefined) data.content = this.editBuffer.content;
    if (this.editBuffer.category !== undefined) data.category = this.editBuffer.category;
    await this.materialsService.updateMaterial(m.id, data);
    this.cancelEdit();
  }

  async deleteMaterial(m: any) {
    if (!this.isTeacher) return;
    if (!confirm('Delete material "' + (m.title || m.fileName || '') + '"?')) return;
    await this.materialsService.deleteMaterial(m.id);
  }

  openModal(m: any, editable = false) {
    this.modalOpen = true;
    this.modalEditable = !!editable && this.isTeacher;
    this.modalMaterial = m;
    this.modalUrl = null;
    this.modalText = '';
    this.modalCategory = m.category || null;
    this.modalTitle = m.title || '';

    if (m.fileBase64 && m.fileType && m.fileName) {
      const blob = this.base64ToBlob(m.fileBase64, m.fileType);
      this.modalUrl = URL.createObjectURL(blob);
      if (this.modalEditable && (m.fileType || '').toLowerCase().startsWith('text/')) {
        this.modalText = this.decodeBase64(m.fileBase64 || '');
      }
    } else if (m.content) {
      this.modalText = String(m.content);
    }
  }

  closeModal() {
    if (this.modalUrl) {
      try { URL.revokeObjectURL(this.modalUrl); } catch {}
    }
    this.modalOpen = false;
    this.modalEditable = false;
    this.modalMaterial = null;
    this.modalUrl = null;
    this.modalText = '';
    this.modalTitle = '';
    this.modalCategory = null;
  }

  async saveModal() {
    if (!this.isTeacher || !this.modalMaterial) return;
    const data: any = { content: this.modalText, updatedAt: Date.now() };
    if (this.modalCategory !== undefined && this.modalCategory !== this.modalMaterial.category) data.category = this.modalCategory;
    if (this.modalTitle !== undefined && this.modalTitle !== this.modalMaterial.title) data.title = this.modalTitle;
    await this.materialsService.updateMaterial(this.modalMaterial.id, data);
    this.closeModal();
  }

  downloadModal() {
    if (this.modalUrl && this.modalMaterial?.fileName) {
      const a = document.createElement('a');
      a.href = this.modalUrl;
      a.download = this.modalMaterial.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (this.modalText) {
      const blob = new Blob([this.modalText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (this.modalMaterial?.fileName) || ((this.modalMaterial?.title || 'note') + '.txt');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  openInNewWindow(m: any) {
    let url: string | null = null;
    let fileName = m.fileName;
    let fileType = m.fileType;
    if (m.fileBase64 && m.fileType && m.fileName) {
      const blob = this.base64ToBlob(m.fileBase64, m.fileType);
      url = URL.createObjectURL(blob);
      fileName = m.fileName;
      fileType = m.fileType;
    } else if (m.content) {
      const blob = new Blob([String(m.content)], { type: 'text/plain;charset=utf-8' });
      url = URL.createObjectURL(blob);
      fileType = 'text/plain';
      fileName = fileName || ((m.title || 'note').replace(/[^a-z0-9\-_.]/gi, '_') + '.txt');
    } else {
      const w = window.open('', '_blank');
      if (w) { w.document.write('<p>No preview available</p>'); w.document.close(); }
      return;
    }

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${this.escapeHtml(m.title||fileName)}</title></head><body>
      <h3>${this.escapeHtml(m.title||fileName)}</h3>
      <div>
        ${fileType && fileType.startsWith('image/') ? `<img src="${url}" style="max-width:100%"/>` : ''}
        ${fileType === 'application/pdf' ? `<embed src="${url}" type="application/pdf" width="100%" height="800px"/>` : ''}
        ${fileType && fileType.startsWith('text/') ? `<pre>${this.escapeHtml(String(m.content || this.decodeBase64(m.fileBase64||'')))}</pre>` : ''}
      </div>
      <div><a href="${url}" download="${this.escapeHtml(fileName || 'file')}">Download</a></div>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      if (url) window.open(url, '_blank');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();

    setTimeout(()=>{ try { URL.revokeObjectURL(url as string); } catch {} }, 15000);
  }

  selectCategory(cat: string) {
    this.closeModal();
    this.selectedCategory = cat === 'All Materials' ? null : cat;
    this.loadMaterials();
  }

  onFileChange(ev: any) {
    const f: File = ev.target.files && ev.target.files[0];
    this.newMaterialFile = f || null;
  }

  async createCategory() {
    if (!this.isTeacher || !this.newCategoryName.trim()) return;
    await this.materialsService.createCategory(this.newCategoryName.trim(), this.user?.uid);
    this.newCategoryName = '';
  }

  async createMaterial() {
    if (!this.isTeacher) return;
    const ownerUid = this.user?.uid;
    let fileBase64: string | undefined;
    let fileName: string | undefined;
    let fileType: string | undefined;
    if (this.newMaterialFile) {
      fileName = this.newMaterialFile.name;
      fileType = this.newMaterialFile.type;
      fileBase64 = await this.readFileAsBase64(this.newMaterialFile);
    }
    const payload: any = {
      title: this.newMaterialTitle || '(untitled) - note',
      category: this.selectedCategory || 'General',
      content: this.newMaterialContent || null,
      ownerUid,
      createdAt: Date.now()
    };
    if (fileName) payload.fileName = fileName;
    if (fileType) payload.fileType = fileType;
    if (fileBase64) payload.fileBase64 = fileBase64;
    await this.materialsService.createMaterial(payload);
    this.newMaterialTitle = '';
    this.newMaterialContent = '';
    this.newMaterialFile = null;
  }

  readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve((fr.result as string).split(',')[1]);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  downloadMaterial(m: any) {
    if (m.fileBase64 && m.fileType && m.fileName) {
      const blob = this.base64ToBlob(m.fileBase64, m.fileType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m.fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  private escapeHtml(s: string) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  private escapeJsString(s: string) {
    return (s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\"/g,'\\\"');
  }

  base64ToBlob(base64: string, type = 'application/octet-stream') {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  decodeBase64(b64: string): string {
    try {
      const atobFn = (globalThis as any).atob || (window as any).atob;
      if (typeof atobFn === 'function') return atobFn(b64);
    } catch {}
    try {
      const Buf = (globalThis as any).Buffer;
      if (Buf && typeof Buf.from === 'function') return Buf.from(b64, 'base64').toString('utf8');
    } catch {}
    return '[Unable to decode base64]';
  }
}