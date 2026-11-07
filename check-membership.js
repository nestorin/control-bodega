const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize with production project
initializeApp({ projectId: 'exepa-almacen-safe' });
const db = getFirestore();

async function checkMembership() {
  const orgId = 'org_exepa_001';
  const usersRef = db.collection('organizations').doc(orgId).collection('users');
  const snapshot = await usersRef.get();
  
  console.log('=== MEMBRESÍAS EN org_exepa_001 ===\n');
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`UID: ${doc.id}`);
    console.log(`  email: ${data.email || 'N/A'}`);
    console.log(`  displayName: ${data.displayName || 'N/A'}`);
    console.log(`  role: ${data.role || 'N/A'}`);
    console.log(`  status: ${data.status || 'N/A'}`);
    console.log(`  warehouseId: ${data.warehouseId || 'N/A'}`);
    console.log(`  warehouseIds: ${JSON.stringify(data.warehouseIds || [])}`);
    console.log(`  createdAt: ${data.createdAt?.toDate?.() || data.createdAt || 'N/A'}`);
    console.log(`  updatedAt: ${data.updatedAt?.toDate?.() || data.updatedAt || 'N/A'}`);
    console.log('---');
  });
}

checkMembership().catch(console.error);
