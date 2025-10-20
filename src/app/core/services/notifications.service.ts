import { Injectable } from '@angular/core';
import { getFirestore, collection, addDoc, updateDoc, doc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private db = getFirestore();

  async sendContactMessage(input: { name: string; email: string; subject: string; message: string }) {
    await addDoc(collection(this.db, 'notifications'), {
      type: 'contact',
      status: 'new',
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      createdAt: serverTimestamp()
    });
  }

  // For teacher dashboard
  listContactNew(limitTo = 20): Observable<any[]> {
    return new Observable(sub => {
      const qRef = query(collection(this.db, 'notifications'), where('type', '==', 'contact')); // no orderBy -> no index
      const stop = onSnapshot(qRef, snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        // sort by createdAt desc client-side
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
          return tb - ta;
        });
        sub.next(items.slice(0, limitTo));
      }, err => sub.error(err));
      return () => stop();
    });
  }

  // List all contact messages (sorted client-side by createdAt desc)
  listContactAll(): Observable<any[]> {
    return new Observable(sub => {
      const qRef = query(collection(this.db, 'notifications'), where('type', '==', 'contact'));
      const stop = onSnapshot(qRef, snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
          return tb - ta;
        });
        sub.next(items);
      }, err => sub.error(err));
      return () => stop();
    });
  }

  markRead(id: string) {
    return updateDoc(doc(this.db, 'notifications', id), { status: 'read' });
  }
}