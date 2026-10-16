// ============================================================
// BABASITARAM PRO - Firebase Configuration
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyC77zcxIzK8ISBZwxwQhANmPlq5skkBpns",
  authDomain: "baba-sitaram-pro.firebaseapp.com",
  projectId: "baba-sitaram-pro",
  storageBucket: "baba-sitaram-pro.firebasestorage.app",
  messagingSenderId: "991032718946",
  appId: "1:991032718946:web:219b8cd748474a3d78033b"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition') console.warn('Multi-tab persistence disabled');
  else if (err.code === 'unimplemented') console.warn('Browser not supported');
});

console.log('✅ Firebase ready');
