import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBiN94LF3SQrfJME_BpSGQ1NU8YAzzcqQk",
    authDomain: "vinted-assistant-d0696.firebaseapp.com",
    projectId: "vinted-assistant-d0696",
    storageBucket: "vinted-assistant-d0696.firebasestorage.app",
    messagingSenderId: "144084237592",
    appId: "1:144084237592:web:edb73751b8a36157cab26d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
