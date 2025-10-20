import { Injectable } from '@angular/core';
import { Firestore, getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MaterialsService {
  private db: Firestore = getFirestore();

  // Categories are stored in 'materialsCategories' as { name, ownerUid, createdAt }
  getCategories(): Observable<string[]> {
    return new Observable(sub => {
      const colRef = collection(this.db, 'materialsCategories');
      const stop = onSnapshot(colRef, snap => {
        const names = Array.from(new Set(
          snap.docs
            .map(d => {
              const x = d.data() as any;
              return (x?.name ?? x?.category ?? x?.title ?? '').toString().trim();
            })
            .filter(v => v.length > 0)
        )).sort((a,b) => a.localeCompare(b));
        sub.next(names);
      }, err => sub.error(err));
      return () => stop();
    });
  }

  createCategory(name: string, ownerUid?: string | null): Promise<string> {
    return addDoc(collection(this.db, 'materialsCategories'), {
      name,
      ownerUid: ownerUid || null,
      createdAt: Date.now()
    }).then(ref => ref.id);
  }

  // Materials live in top-level 'materials'
  // Each material: { title, category, content?, fileBase64?, fileName?, fileType?, ownerUid, createdAt, updatedAt? }
  getMaterialsByCategory(category?: string): Observable<any[]> {
    return new Observable(sub => {
      const colRef = collection(this.db, 'materials');
      const q = category
        ? query(colRef, where('category', '==', category)) // no orderBy -> no composite index needed
        : query(colRef, orderBy('createdAt', 'desc'));

      const stop = onSnapshot(q, snap => {
        let items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        if (category) {
          items = items.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
            return tb - ta;
          });
        }
        sub.next(items);
      }, err => sub.error(err));
      return () => stop();
    });
  }

  createMaterial(payload: any): Promise<string> {
    return addDoc(collection(this.db, 'materials'), {
      ...payload,
      createdAt: payload?.createdAt || Date.now()
    }).then(ref => ref.id);
  }

  updateMaterial(id: string, updates: any): Promise<void> {
    return updateDoc(doc(this.db, 'materials', id), {
      ...updates,
      updatedAt: Date.now()
    });
  }

  deleteMaterial(id: string): Promise<void> {
    return deleteDoc(doc(this.db, 'materials', id));
  }
}