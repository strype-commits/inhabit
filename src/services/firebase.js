// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  updateProfile
} from "firebase/auth";
import { 
  getDatabase, 
  ref as dbRef, 
  onValue, 
  set, 
  push, 
  update 
} from "firebase/database";
import { ref } from 'vue';

// ----------------------
// Firebase configuration
// ----------------------
const firebaseConfig = {
  apiKey: "AIzaSyDJagyv-XcrcG5iF531N0t_6NXYqKT5rWo",
  authDomain: "inhabit-webapp.firebaseapp.com",
  databaseURL: "https://inhabit-webapp-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "inhabit-webapp",
  storageBucket: "inhabit-webapp.firebasestorage.app",
  messagingSenderId: "679111317229",
  appId: "1:679111317229:web:0a25ceedd130aa039d1ee4"
};

// ----------------------
// Initialize Firebase
// ----------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ----------------------
// Reactive current user
// ----------------------
export const currentUser = ref(null);

onAuthStateChanged(auth, (user) => {
  currentUser.value = user;
});

// ----------------------
// Auth helper functions
// ----------------------
function registerWithEmail({ email, password, username }) {
  return createUserWithEmailAndPassword(auth, email, password)
    .then(({ user }) => {
      // store username & metadata in Realtime DB under /users/{uid}
      const userRef = dbRef(db, `users/${user.uid}`);
      return set(userRef, {
        email,
        username,
        role: "user",
        sensors: {}
      }).then(() => user);
    });
}

function loginWithEmail({ email, password }) {
  return signInWithEmailAndPassword(auth, email, password);
}

function logout() {
  return signOut(auth);
}

function onAuthChange(cb) {
  return onAuthStateChanged(auth, cb);
}

// ----------------------
// Realtime DB helpers
// ----------------------
function subscribeToSensor(sensorId, callback) {
  const sensorRef = dbRef(db, `sensors/${sensorId}`);
  return onValue(sensorRef, (snap) => callback(snap.val()));
}

function getSensorListOnce(cb) {
  const sensorsRef = dbRef(db, 'sensors');
  return onValue(sensorsRef, (snap) => cb(snap.val()), { onlyOnce: true });
}

// ----------------------
// Exports
// ----------------------
export {
  app,
  auth,
  db,
  registerWithEmail,
  loginWithEmail,
  logout,
  onAuthChange,
  subscribeToSensor,
  getSensorListOnce,
  dbRef as ref,
  set,
  update,
  push,
  createUserWithEmailAndPassword,
  updateProfile
};
