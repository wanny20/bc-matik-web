// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

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

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
export const auth = getAuth(app);
export const storage = getStorage(app);

/**
 * Compresses any uploaded image on the client side using HTML5 Canvas
 * so each photo is only ~20KB - 45KB (keeping Firebase Blaze Storage 100% at $0 cost!).
 */
export const compressImageFile = (file, maxWidth = 600, maxHeight = 600, quality = 0.68) => {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file provided"));
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        canvas.toBlob(
          (blob) => resolve({ blob, dataUrl }),
          "image/jpeg",
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

/**
 * Dispatches an automated email alert via Brevo (if VITE_BREVO_API_KEY is set in .env)
 * and logs the email dispatch for registered students who enabled Email Notifications.
 */
export const sendAutomatedClientEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  if (!toEmail || !toEmail.includes("@")) return false;
  const brevoKey = import.meta.env?.VITE_BREVO_API_KEY;
  if (!brevoKey) {
    console.info(`[BCMatik Email Engine] Simulated email to ${toEmail}: ${subject}`);
    return true;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": brevoKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: { name: "Bicol College • BCMatik", email: "no-reply@bc.edu.ph" },
        to: [{ email: toEmail.trim(), name: toName || "BCMatik Client" }],
        subject,
        htmlContent
      })
    });
    return res.ok;
  } catch (err) {
    console.warn("Email dispatch warning:", err);
    return false;
  }
};