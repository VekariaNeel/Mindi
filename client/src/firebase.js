import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDoZUC_LIktZsGqvjsmBdxUkSITYYphxUI",
  authDomain: "mindi-d0bb7.firebaseapp.com",
  projectId: "mindi-d0bb7",
  storageBucket: "mindi-d0bb7.firebasestorage.app",
  messagingSenderId: "467696955073",
  appId: "1:467696955073:web:857cd9e7df97db14972e40",
  measurementId: "G-XD115P9B14"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
