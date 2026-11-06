// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAz16L8wgWWU2sHjzNXzjHfx3Er-D89psM",
  authDomain: "bc-matik.firebaseapp.com",
  databaseURL: "https://bc-matik-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bc-matik",
  storageBucket: "bc-matik.firebasestorage.app",
  messagingSenderId: "972680196272",
  appId: "1:972680196272:web:4a69f28fe716fb5dda8b75",
  measurementId: "G-4CQ8478HF5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and Authentication
export const db = getFirestore(app);
export const auth = getAuth(app);