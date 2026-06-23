require("dotenv").config({ path: __dirname + '/.env' });
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const puppeteer = require("puppeteer");
const cron = require("node-cron");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// Generate Key Pair for Secure QR
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
app.get("/verify-child.html", (req, res) => {
  let query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  query = query.replace("childId=", "id=");
  res.redirect(`/verify.html${query}`);
});
app.get("/vaccinator/verify-child.html", (req, res) => {
  let query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  query = query.replace("childId=", "id=");
  res.redirect(`/verify.html${query}`);
});

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "your_google_maps_key";

// Allow all origins for local setup
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://vaccilink-final.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
].filter(Boolean);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from both root and /frontend
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, "frontend")));

// Root route — opens the landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

/* MongoDB Connection & Initialization */

const MONGO_URI = process.env.MONGO_URI;

async function initializeDatabase() {
  try {
    await mongoose.connect(MONGO_URI, {
    });
    console.log("✅ MongoDB Connected to:", MONGO_URI);
    await Parent.collection.createIndex({ childID: 1 }).catch(() => { });
    await Appointment.collection.createIndex({ childID: 1 }).catch(() => { });
    await Appointment.collection.createIndex({ centerId: 1 }).catch(() => { });
    await Appointment.collection.createIndex({ appointmentDate: 1 }).catch(() => { });
    await Center.collection.createIndex({ centerId: 1 }, { unique: true }).catch(() => { });
    await Notification.collection.createIndex({ childID: 1 }).catch(() => { });
    await Vaccinator.collection.createIndex({ vaccinatorID: 1 }).catch(() => { });

  } catch (err) {
    console.error("❌ MongoDB Error:", err.message);
  }
}

// Initialize database on startup
initializeDatabase();

/* Email transporter */

// Force IPv4 DNS resolution globally to prevent "ENETUNREACH 2404:6800..." (IPv6) errors on Render
const dns = require("dns");
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465, // Use Port 465 for SSL/TLS, which is more reliable on Render than 587
  secure: true, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    // Do not fail on invalid certs (optional, helpful for some Render networking configurations)
    rejectUnauthorized: false
  },
  connectionTimeout: 20000, // 20 seconds
  socketTimeout: 20000,
  logger: true,
  debug: true
});

// Diagnostic check for SMTP connection
transporter.verify(function (error, success) {
  if (error) {
    console.error("❌ SMTP Connection Error:", error);
    console.log(`Diagnostic Info: EMAIL_USER loaded = ${!!process.env.EMAIL_USER}, EMAIL_PASS loaded = ${!!process.env.EMAIL_PASS}`);
  } else {
    console.log("✅ SMTP Server is ready to take our messages");
  }
});

const emblemImagePath = path.join(__dirname, "frontend", "images", "cartificate-emblem-of-india-.jpeg");
let emblemBase64 = "";
if (fs.existsSync(emblemImagePath)) {
  emblemBase64 = "data:image/jpeg;base64," + fs.readFileSync(emblemImagePath, "base64");
}

const signImagePath = path.join(__dirname, "frontend", "images", "certificate-sign.png");
let signBase64 = "";
if (fs.existsSync(signImagePath)) {
  signBase64 = "data:image/png;base64," + fs.readFileSync(signImagePath, "base64");
}

function generateCertificateHTML(parent, vaccineName, doseNumber, centerName, dateTaken, vaccinatorName, certificateId, qrDataUrl) {
  const dObj = new Date(dateTaken);
  const dStr = dObj.toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit', year: 'numeric' }) + ", " + dObj.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const qrImgTag = qrDataUrl ? `<img src="${qrDataUrl}" width="80" height="80" style="margin:auto; display:block; border:1px solid #ddd;"/>` : `<div style="width:80px;height:80px;border:1px solid #333;margin:auto;">QR</div>`;

  return `
    <div style="font-family: Arial, sans-serif; background-color: #ffffff; padding: 40px; color: #333; max-width: 850px; margin: auto; position: relative;">
      
      <!-- Outer green border -->
      <div style="border: 3px solid #2e7d32; padding: 30px; border-radius: 12px; position: relative; overflow: hidden;">
        
        <!-- Header -->
        <table style="width: 100%; border-bottom: 2px solid #2e7d32; padding-bottom: 15px; margin-bottom: 20px;">
          <tr>
            <td style="width: 25%; text-align: center; vertical-align: middle;"></td>
            <td style="width: 50%; text-align: center; vertical-align: middle;">
              ${emblemBase64 ? `<img src="${emblemBase64}" alt="Government Emblem" style="height: 80px; display: block; margin: 0 auto 5px auto;" />` : ''}
              <p style="margin: 0; font-size: 12px; font-weight: bold; letter-spacing: 1px;">GOVERNMENT OF INDIA</p>
              <h1 style="color: #1b5e20; margin: 5px 0; font-size: 22px; text-transform: uppercase;">Ministry of Health & Family Welfare</h1>
              <p style="margin: 5px 0 0 0; font-size: 11px;">DEPARTMENT OF HEALTH AND FAMILY WELFARE</p>
              <div style="margin: 8px auto; width: 140px; height: 3px; background: linear-gradient(to right, #ff9933 33%, #ffffff 33%, #ffffff 66%, #138808 66%); border: 1px solid #ddd; position: relative;">
                <div style="position: absolute; left: 50%; top: -7px; transform: translateX(-50%); width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 1.5px solid #000080; display:flex; justify-content:center; align-items:center;">
                  <div style="width:10px; height:1px; background:#000080; transform:rotate(45deg); position:absolute;"></div>
                  <div style="width:10px; height:1px; background:#000080; transform:rotate(-45deg); position:absolute;"></div>
                  <div style="width:1px; height:10px; background:#000080; position:absolute;"></div>
                  <div style="width:10px; height:1px; background:#000080; position:absolute;"></div>
                </div>
              </div>
            </td>
            <td style="width: 25%; text-align: center; vertical-align: middle;">
               <svg width="60" height="70" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
                 <path d="M50 10 L90 30 L90 70 C90 90 50 115 50 115 C50 115 10 90 10 70 L10 30 Z" fill="#e8f5e9" stroke="#1b5e20" stroke-width="4"/>
                 <circle cx="50" cy="50" r="16" fill="#1b5e20"/>
                 <circle cx="28" cy="65" r="10" fill="#1b5e20"/>
                 <circle cx="72" cy="65" r="10" fill="#1b5e20"/>
                 <path d="M45 45 L55 45 M50 40 L50 50" stroke="#fff" stroke-width="2"/>
               </svg>
               <div style="color: #1b5e20; font-weight: bold; font-size: 13px; margin-top:2px;">VACCILINK</div>
               <div style="color: #666; font-size: 7px;">Linking Families. Protecting Futures.</div>
            </td>
          </tr>
        </table>

        <!-- Title -->
        <div style="text-align: center; margin-bottom: 5px;">
          <h2 style="color: #1b5e20; font-size: 38px; margin: 0; display: inline-flex; align-items: center; justify-content: center;">
            Vaccination Certificate 
            <svg width="36" height="36" viewBox="0 0 24 24" fill="#2e7d32" style="margin-left: 10px;">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
            </svg>
          </h2>
          <div style="margin-top: 5px; color: #4caf50;">
             <span style="font-size:18px;">★</span>
             <span style="font-size:24px; margin: 0 5px;">★</span>
             <span style="font-size:18px;">★</span>
          </div>
        </div>

        <!-- Body / Introduction -->
        <div style="text-align: center; font-size: 16px; margin-bottom: 25px; color: #333;">
          <p>This is to certify that the following vaccination has been administered<br>as per the Government of India’s Immunization Program.</p>
        </div>

        <!-- Detail Cards Grid -->
        <div style="border: 1px solid #ddd; border-radius: 12px; margin-bottom: 25px; overflow:hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 16px;">
            <tbody>
              <tr>
                <td style="padding: 15px 20px; border-bottom: 1px solid #ddd; border-right: 1px solid #ddd; width: 50%;">
                  <div style="display:flex; align-items:center;">
                    <div style="background:#e8f5e9; padding:10px; border-radius:50%; margin-right:15px; display:inline-flex;">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#2e7d32"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    </div>
                    <div>
                      <span style="color: #666; display: block; font-size: 13px; margin-bottom: 2px;">Child Name</span>
                      <strong style="color: #222; font-size:18px;">${parent.childName || 'N/A'}</strong>
                    </div>
                  </div>
                </td>
                <td style="padding: 15px 20px; border-bottom: 1px solid #ddd; width: 50%;">
                  <div style="display:flex; align-items:center;">
                    <div style="background:#e8f5e9; padding:10px; border-radius:50%; margin-right:15px; display:inline-flex;">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#2e7d32"><path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.89 3 3.01 3.9 3.01 5L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
                    </div>
                    <div>
                      <span style="color: #666; display: block; font-size: 13px; margin-bottom: 2px;">Date & Time</span>
                      <strong style="color: #222; font-size:17px;">${dStr}</strong>
                    </div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 15px 20px; border-bottom: 1px solid #ddd; border-right: 1px solid #ddd;">
                   <div style="display:flex; align-items:center;">
                    <div style="background:#e8f5e9; padding:10px; border-radius:50%; margin-right:15px; display:inline-flex;">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#2e7d32"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                    </div>
                    <div>
                      <span style="color: #666; display: block; font-size: 13px; margin-bottom: 2px;">Parent Name</span>
                      <strong style="color: #222; font-size:18px;">${parent.parentName || 'N/A'}</strong>
                    </div>
                  </div>
                </td>
                <td style="padding: 15px 20px; border-bottom: 1px solid #ddd;">
                  <div style="display:flex; align-items:center;">
                    <div style="background:#e8f5e9; padding:10px; border-radius:50%; margin-right:15px; display:inline-flex;">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#2e7d32"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>
                    </div>
                    <div>
                      <span style="color: #666; display: block; font-size: 13px; margin-bottom: 2px;">Center</span>
                      <strong style="color: #222; font-size:18px;">${centerName || 'N/A'}</strong>
                    </div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 15px 20px; border-right: 1px solid #ddd;">
                  <div style="display:flex; align-items:center;">
                    <div style="background:#e8f5e9; padding:10px; border-radius:50%; margin-right:15px; display:inline-flex;">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#2e7d32"><path d="M13.49 5.48c1.1 1.1 1.1 2.9 0 4l-4 4c-1.1 1.1-2.9 1.1-4 0-1.1-1.1-1.1-2.9 0-4l4-4c1.1-1.1 2.9-1.1 4 0zm-1.42 1.42l-4 4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l4-4c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0zM19 14l-5 5h3v5h4v-5h3z"/></svg>
                    </div>
                    <div>
                      <span style="color: #666; display: block; font-size: 13px; margin-bottom: 2px;">Vaccine</span>
                      <strong style="color: #222; font-size:18px;">${vaccineName} (Dose ${doseNumber})</strong>
                    </div>
                  </div>
                </td>
                <td style="padding: 15px 20px;">
                  <div style="display:flex; align-items:center;">
                    <div style="background:#e8f5e9; padding:10px; border-radius:50%; margin-right:15px; display:inline-flex;">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#2e7d32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    </div>
                    <div>
                      <span style="color: #666; display: block; font-size: 13px; margin-bottom: 2px;">Vaccinator</span>
                      <strong style="color: #222; font-size:18px;">${vaccinatorName || 'N/A'}</strong>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Banner -->
        <div style="background-color: #dcfce7; border-radius: 8px; padding: 12px 20px; display: flex; align-items: center; justify-content: center; margin-bottom: 30px;">
           <div style="background:#2e7d32; color:white; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:12px; font-weight:bold; font-size:14px; transform:translateY(-2px);">✔</div>
           <div style="text-align:left;">
             <span style="color:#333; font-size:14px;">The vaccination has been recorded in the official Immunization Registry.</span><br>
             <strong style="color:#1b5e20; font-size:16px;">Stay Protected, Stay Healthy.</strong>
           </div>
        </div>

        <!-- Signatures and QR -->
        <table style="width: 100%; text-align: center; margin-bottom: 10px;">
          <tr>
            <td style="width: 33%; vertical-align: bottom; text-align: left;">
               ${qrImgTag}
               <div style="font-size: 11px; color: #333; margin-top:5px; font-weight:bold;">Certificate ID: ${certificateId}</div>
               <div style="font-size: 10px; color: #666;">Scan to verify this certificate</div>
            </td>
            <td style="width: 34%; vertical-align: middle;">
               <!-- Seal SVG -->
               <svg width="100" height="100" viewBox="0 0 120 120" style="margin:auto; display:block;">
                 <circle cx="60" cy="60" r="50" fill="none" stroke="#2e7d32" stroke-width="2" stroke-dasharray="4,4"/>
                 <circle cx="60" cy="60" r="44" fill="none" stroke="#2e7d32" stroke-width="1.5"/>
                 <circle cx="60" cy="60" r="41" fill="none" stroke="#2e7d32" stroke-width="0.5"/>
                 <text x="60" y="53" font-family="Arial" font-size="15" font-weight="bold" fill="#2e7d32" text-anchor="middle">FULLY</text>
                 <text x="60" y="75" font-family="Arial" font-size="15" font-weight="bold" fill="#2e7d32" text-anchor="middle">VACCINATED</text>
                 <path d="M 30 60 C 30 75, 45 90, 60 90 C 75 90, 90 75, 90 60" fill="none" stroke="#2e7d32" stroke-width="1"/>
                 <text x="60" y="25" font-size="12" fill="#2e7d32" text-anchor="middle">★★★</text>
                 <text x="60" y="105" font-size="12" fill="#2e7d32" text-anchor="middle">★★★</text>
               </svg>
            </td>
            <td style="width: 33%; vertical-align: bottom; text-align: right;">
              ${signBase64 ? `<img src="${signBase64}" alt="Authorized Signature" style="height: 60px; display: block; margin-left: auto;" />` : ''}
              <div style="font-weight: bold; color: #111; font-size:14px; margin-top:5px;">Authorized Signature</div>
              <div style="font-size: 12px; color: #444;">Health Officer</div>
              <div style="font-size: 11px; color: #666;">(Government of India)</div>
            </td>
          </tr>
        </table>
        
        <!-- Footer line -->
        <div style="background-color: #f1f8e9; padding: 10px; border-radius: 6px; text-align: center; margin-top: 20px;">
          <span style="font-size: 13px; color: #555; display:inline-flex; align-items:center;">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="#666" style="margin-right:5px;"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>
             This is a digitally generated certificate. No signature is required.
          </span>
        </div>

      </div>
    </div>
  `;
}

function generateEmailHTML(parent, vaccineName, doseNumber, centerName, dateTaken, vaccinatorName) {
  const dObj = new Date(dateTaken);
  const dateStr = dObj.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' }); // 04 Oct 2026
  const timeStr = dObj.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' }); // 11:00 AM

  return `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; font-size: 14px;">
      <p>Dear ${parent.parentName},</p>
      <p>This is to inform you that the vaccination for your child has been successfully completed as per the schedule.<br>
      Please find the vaccination certificate attached with this email for your records.</p>
      
      <p style="color: #2e7d32; font-weight: bold; font-size: 16px; margin-bottom: 5px;">Child Details:</p>
      <table style="font-family: Arial, sans-serif; font-size: 14px; border: none; margin-bottom:10px;">
        <tr><td style="width: 120px;">Child Name</td><td>: <strong>${parent.childName}</strong></td></tr>
        <tr><td>Date of Visit</td><td>: ${dateStr}</td></tr>
        <tr><td>Time</td><td>: ${timeStr}</td></tr>
        <tr><td>Center</td><td>: ${centerName}</td></tr>
        <tr><td>Vaccinator</td><td>: ${vaccinatorName}</td></tr>
      </table>

      <p style="color: #2e7d32; font-weight: bold; font-size: 16px; margin-top: 20px; margin-bottom: 5px;">Vaccines Administered:</p>
      <table style="width: 100%; max-width: 600px; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; text-align: center;">
        <thead>
          <tr>
            <th style="border: 1px solid #ccc; padding: 8px; background-color: #f9f9f9; color:#333;">Vaccine Name</th>
            <th style="border: 1px solid #ccc; padding: 8px; background-color: #f9f9f9; color:#333;">Dose</th>
            <th style="border: 1px solid #ccc; padding: 8px; background-color: #f9f9f9; color:#333;">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #ccc; padding: 8px; color:#333;">${vaccineName}</td>
            <td style="border: 1px solid #ccc; padding: 8px; color:#333;">Dose ${doseNumber}</td>
            <td style="border: 1px solid #ccc; padding: 8px; color:#333;">Completed</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top: 20px; color:#333;">This certificate is digitally generated and does not require a physical signature.<br>
      Kindly keep this document safe for future reference.</p>
      
      <p style="margin-top: 20px; color:#333;">
        <strong>Regards,</strong><br>
        <span style="color: #2e7d32; font-weight: bold;">Vaccilink Team</span>
      </p>
      
      <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply.</p>
    </div>
  `;
}
/* Vaccination Schedule Logic for Backend */
const VACCINE_BATCHES = [
  {
    age: "At Birth",
    days: 0,
    vaccines: [
      {
        name: "BCG",
        doseNumber: 1,
        purpose: "Protects against Tuberculosis.",
        description: "Given at birth to prevent severe TB in children.",
        sideEffects: "Mild fever, swelling or scar at injection site.",
        doseSite: "Left upper arm"
      },
      {
        name: "OPV-0",
        doseNumber: 1,
        purpose: "Protects against Polio.",
        description: "Birth dose oral polio vaccine.",
        sideEffects: "Usually none.",
        doseSite: "Oral drops"
      },
      {
        name: "Hepatitis-B",
        doseNumber: 1,
        purpose: "Protects against Hepatitis B infection.",
        description: "Birth dose to prevent liver infection.",
        sideEffects: "Mild fever, soreness.",
        doseSite: "Thigh"
      },
      {
        name: "Vitamin K",
        doseNumber: 1,
        purpose: "Prevents bleeding disorder in newborns.",
        description: "Given after birth for blood clotting support.",
        sideEffects: "Rare pain or swelling.",
        doseSite: "Thigh"
      }
    ]
  },

  {
    age: "6 Weeks",
    days: 42,
    vaccines: [
      {
        name: "Pentavalent-1",
        doseNumber: 1,
        purpose: "Protects against 5 diseases.",
        description: "First Pentavalent dose.",
        sideEffects: "Fever, swelling.",
        doseSite: "Thigh"
      },
      {
        name: "OPV-1",
        doseNumber: 1,
        purpose: "Polio protection.",
        description: "First scheduled OPV dose.",
        sideEffects: "Usually none.",
        doseSite: "Oral drops"
      },
      {
        name: "Rotavirus-1",
        doseNumber: 1,
        purpose: "Prevents severe diarrhea.",
        description: "First Rotavirus dose.",
        sideEffects: "Mild stomach upset.",
        doseSite: "Oral"
      },
      {
        name: "IPV-1",
        doseNumber: 1,
        purpose: "Injectable Polio protection.",
        description: "First IPV dose.",
        sideEffects: "Pain, fever.",
        doseSite: "Thigh"
      },
      {
        name: "PCV-1",
        doseNumber: 1,
        purpose: "Protects from pneumonia.",
        description: "First PCV dose.",
        sideEffects: "Fever, pain.",
        doseSite: "Thigh"
      }
    ]
  },

  {
    age: "10 Weeks",
    days: 70,
    vaccines: [
      {
        name: "Pentavalent-2",
        doseNumber: 2,
        purpose: "Second protection booster.",
        description: "Second Pentavalent dose.",
        sideEffects: "Fever, swelling.",
        doseSite: "Thigh"
      },
      {
        name: "OPV-2",
        doseNumber: 2,
        purpose: "Polio protection.",
        description: "Second OPV dose.",
        sideEffects: "Usually none.",
        doseSite: "Oral drops"
      },
      {
        name: "Rotavirus-2",
        doseNumber: 2,
        purpose: "Diarrhea prevention.",
        description: "Second Rotavirus dose.",
        sideEffects: "Mild stomach upset.",
        doseSite: "Oral"
      },
      {
        name: "PCV-2",
        doseNumber: 2,
        purpose: "Pneumonia protection.",
        description: "Second PCV dose.",
        sideEffects: "Fever.",
        doseSite: "Thigh"
      }
    ]
  },

  {
    age: "14 Weeks",
    days: 98,
    vaccines: [
      {
        name: "Pentavalent-3",
        doseNumber: 3,
        purpose: "Final primary protection.",
        description: "Third Pentavalent dose.",
        sideEffects: "Fever.",
        doseSite: "Thigh"
      },
      {
        name: "OPV-3",
        doseNumber: 3,
        purpose: "Polio protection.",
        description: "Third OPV dose.",
        sideEffects: "Usually none.",
        doseSite: "Oral drops"
      },
      {
        name: "Rotavirus-3",
        doseNumber: 3,
        purpose: "Final Rotavirus dose.",
        description: "Third Rotavirus dose.",
        sideEffects: "Mild upset stomach.",
        doseSite: "Oral"
      },
      {
        name: "IPV-2",
        doseNumber: 2,
        purpose: "Second injectable Polio dose.",
        description: "Second IPV dose.",
        sideEffects: "Pain, fever.",
        doseSite: "Thigh"
      },
      {
        name: "PCV-3",
        doseNumber: 3,
        purpose: "Final pneumonia protection.",
        description: "Third PCV dose.",
        sideEffects: "Mild fever.",
        doseSite: "Thigh"
      }
    ]
  },

  {
    age: "9 Months",
    days: 270,
    vaccines: [
      {
        name: "MR-1",
        doseNumber: 1,
        purpose: "Protects against Measles & Rubella.",
        description: "First MR dose.",
        sideEffects: "Fever, rash.",
        doseSite: "Arm"
      },
      {
        name: "Vitamin A",
        doseNumber: 1,
        purpose: "Improves immunity and eyesight.",
        description: "Vitamin A supplement.",
        sideEffects: "Usually none.",
        doseSite: "Oral syrup"
      }
    ]
  },

  {
    age: "16 Months",
    days: 480,
    vaccines: [
      {
        name: "MR-2",
        doseNumber: 2,
        purpose: "Second Measles Rubella booster.",
        description: "Second MR dose.",
        sideEffects: "Mild fever.",
        doseSite: "Arm"
      },
      {
        name: "DPT Booster",
        doseNumber: 1,
        purpose: "Booster for Diphtheria, Pertussis, Tetanus.",
        description: "Given at 16 months.",
        sideEffects: "Pain, swelling.",
        doseSite: "Arm"
      },
      {
        name: "OPV Booster",
        doseNumber: 1,
        purpose: "Polio booster protection.",
        description: "Extra OPV booster dose.",
        sideEffects: "Usually none.",
        doseSite: "Oral drops"
      }
    ]
  }
];
function generateSchedule(childDOB) {
  const dob = new Date(childDOB);
  dob.setHours(0, 0, 0, 0);
  let fullSchedule = [];
  VACCINE_BATCHES.forEach(batch => {
    batch.vaccines.forEach(v => {
      const scheduledDate = new Date(dob);
      scheduledDate.setDate(scheduledDate.getDate() + batch.days);
      fullSchedule.push({
        vaccineName: v.name,
        doseNumber: v.doseNumber,
        dueDate: scheduledDate,
        age: batch.age
      });
    });
  });
  return fullSchedule;
}


function mergeHistory(schedule, history) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let merged = schedule.map(sch => {
    const dbRecord = history.find(
      h => h.vaccineName === sch.vaccineName && h.doseNumber === sch.doseNumber
    );

    let status = "upcoming";
    let scheduledDate = sch.dueDate;

    if (dbRecord) {
      if (dbRecord.dateTaken || dbRecord.status === "completed") {
        status = "completed";
      } else if (dbRecord.status === "scheduled") {
        status = "scheduled";
        if (dbRecord.scheduledDate) {
          scheduledDate = new Date(dbRecord.scheduledDate);
        }
      } else if (today > sch.dueDate) {
        status = "overdue";
      }
    } else if (today > sch.dueDate) {
      status = "overdue";
    }

    return {
      ...sch,
      // ✅ include age from schedule batch
      age: sch.age,
      status,
      scheduledDate,
      dueDate: sch.dueDate,
      hospital: dbRecord ? (dbRecord.hospital || "") : "",
      hospitalAddress: dbRecord ? (dbRecord.hospitalAddress || "") : "",
      dateTaken: dbRecord ? (dbRecord.dateTaken || null) : null,
      centerId: dbRecord ? (dbRecord.centerId || "") : "",
      vaccinatorID: dbRecord ? (dbRecord.vaccinatorID || "") : "",
      arrivedToday: dbRecord ? !!dbRecord.arrivedToday : false,
      visitDate: dbRecord ? (dbRecord.visitDate || null) : null
    };
  });

  // ✅ ADD MISSING DB RECORDS (records in DB not matched to schedule)
  history.forEach(h => {
    const exists = merged.find(
      m => m.vaccineName === h.vaccineName && m.doseNumber === h.doseNumber
    );

    if (!exists) {
      merged.push({
        vaccineName: h.vaccineName,
        doseNumber: h.doseNumber,
        age: "",
        scheduledDate: h.scheduledDate || null,
        dueDate: h.scheduledDate || null,
        status: (h.dateTaken || h.status === "completed") ? "completed" : (h.status || "scheduled"),
        hospital: h.hospital || "",
        hospitalAddress: h.hospitalAddress || "",
        dateTaken: h.dateTaken || null,
        centerId: h.centerId || "",
        vaccinatorID: h.vaccinatorID || "",
        arrivedToday: !!h.arrivedToday,
        visitDate: h.visitDate || null
      });
    }
  });

  return merged;
}

/** Schedule lookup + upsert vaccinationHistory row (no duplicate vaccineName+dose) */
function findScheduleEntry(childDOB, vaccineName, doseNumber) {
  if (!childDOB) return null;
  const schedule = generateSchedule(childDOB);
  return schedule.find(
    s => s.vaccineName === vaccineName && String(s.doseNumber) === String(doseNumber)
  ) || null;
}

function getDoseNumberForVaccine(childDOB, vaccineName) {
  if (!childDOB || !vaccineName) return 1;
  const schedule = generateSchedule(childDOB);
  const m = schedule.find(s => s.vaccineName === vaccineName);
  return m ? m.doseNumber : 1;
}

function upsertVaccinationRecord(parent, vaccineName, doseNumber, patch = {}) {
  const dose = Number(doseNumber);
  const d = Number.isFinite(dose) ? dose : 1;
  let record = parent.vaccinationHistory.find(
    v => v.vaccineName === vaccineName && Number(v.doseNumber) === d
  );
  if (!record) {
    const sch = findScheduleEntry(parent.childDOB, vaccineName, d);
    record = {
      vaccineName,
      doseNumber: d,
      scheduledDate: sch ? sch.dueDate : null,
      dateTaken: null,
      hospital: "",
      hospitalAddress: "",
      centerId: "",
      distance: "",
      status: "upcoming",
      arrivedToday: false
    };
    parent.vaccinationHistory.push(record);
  }
  Object.assign(record, patch);
  return record;
}

let otpStore = {};
/** QR access tokens: token -> { childID, exp } */
let qrTokenStore = {};
/** Vaccinator access OTP: `${childID}:${vaccinatorID}` -> { otp, exp } */
let vaccinatorAccessOtpStore = {};

/* Schema */

const parentSchema = new mongoose.Schema({

  parentName: String,
  email: String,
  password: String,
  phone: String,

  address: String,
  city: String,
  pincode: String,

  childName: String,
  childDOB: String,
  motherDOB: String,
  gender: { type: String, default: "Unknown" },

  hospital: String,
  parentAadhar: String,

  /** Stable secret embedded in printed QR (one per child); created lazily if missing */
  qrSecret: String,

  childID: String,

  vaccinationHistory: [{
    vaccineName: String,
    doseNumber: Number,
    scheduledDate: Date,
    dateTaken: Date,
    hospital: String,
    hospitalAddress: String,
    centerId: String,
    distance: String,
    status: String,
    arrivedToday: { type: Boolean, default: false },
    visitDate: Date,
    updatedByVaccinator: { type: Boolean, default: false },
    vaccinatorID: String,
    updatedAt: Date,
    certificateId: String,
    issuedAt: Date,
    qrCode: String,
    vaccinatorName: String,
    postVaccineEffects: { type: String, default: "" }
  }]

});

const Parent = mongoose.model("Parent", parentSchema);

const appointmentSchema = new mongoose.Schema({
  childName: String,
  childID: String,
  parentPhone: String,
  vaccineName: String,
  doseNumber: { type: Number, default: 1 },
  appointmentDate: Date,
  appointmentTime: { type: String, default: "" },
  hospital: String,
  hospitalAddress: String,
  centerId: String,
  status: { type: String, default: "pending" }, // pending, completed, rejected, accepted
  type: { type: String, default: "online" } // online or onsite
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

/* Center Schema */
const centerSchema = new mongoose.Schema({
  centerId: { type: String, unique: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  pincode: { type: String, default: "" },
  city: { type: String, default: "" }
});

const Center = mongoose.model("Center", centerSchema);

/* Notification Schema */
const notificationSchema = new mongoose.Schema({
  childID: String,
  childName: String,
  vaccineName: String,
  doseNumber: Number,
  centerId: String,
  hospitalName: String,
  eventDate: Date,
  message: String,
  type: String, // reminder | overdue
  date: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const Notification = mongoose.model("Notification", notificationSchema);

async function ensureQrSecret(parent) {
  if (!parent) return null;
  if (parent.qrSecret) return parent.qrSecret;
  parent.qrSecret = crypto.randomBytes(20).toString("hex");
  await parent.save();
  return parent.qrSecret;
}

function formatNotifDateShort(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(dt.getDate()).padStart(2, "0")} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

function buildVerifyQrUrl(base, certificateId) {
  const b = String(base || "").replace(/\/$/, "");
  return `${b}/verify.html?id=${encodeURIComponent(certificateId)}`;
}
function notifDedupeKey(item) {
  const d = item.date || item.created_at;
  const day = d ? String(d).slice(0, 10) : "";
  return `${item.type}|${item.vaccine_id || ""}|${day}`;
}

function notificationDocToStructuredApi(doc, childNameFallback) {
  const type = String(doc.type || "reminder").toLowerCase() === "overdue" ? "overdue" : "reminder";
  const child_name = doc.childName || childNameFallback || "";
  const vaccine_name = doc.vaccineName || "";
  const dose = doc.doseNumber != null ? Number(doc.doseNumber) : 1;
  const vaccine_id = vaccine_name ? `${vaccine_name}_${dose}` : "";
  const hospital_name = doc.hospitalName || "";
  const hospital_id = doc.centerId || "";
  const eventD = doc.eventDate || doc.date;
  const ev = eventD instanceof Date ? eventD : new Date(eventD);
  const dateIso = isNaN(ev.getTime()) ? new Date(doc.date).toISOString() : ev.toISOString();
  let message = doc.message || "";
  if (!message) {
    const ds = formatNotifDateShort(ev);
    const hosp = hospital_name || "your clinic";
    if (type === "overdue") {
      message = `Overdue: ${vaccine_name || "Vaccine"} vaccine was missed on ${ds}. Please visit ${hosp}.`;
    } else {
      message = `Reminder: ${child_name} has an upcoming ${vaccine_name || "vaccination"} on ${ds} at ${hosp}.`;
    }
  }
  return {
    type,
    child_id: doc.childID,
    child_name,
    vaccine_name,
    vaccine_id,
    hospital_id,
    hospital_name,
    date: dateIso,
    message,
    created_at: (doc.date instanceof Date ? doc.date : new Date(doc.date)).toISOString(),
    read: !!doc.read
  };
}

function buildDerivedScheduleNotifications(parent, merged) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 30);
  const child_name = parent.childName || "";
  const out = [];
  for (const v of merged) {
    if (v.status === "completed") continue;
    const sched = new Date(v.scheduledDate || v.dueDate);
    if (isNaN(sched.getTime())) continue;
    sched.setHours(0, 0, 0, 0);
    const hospital_name = v.hospital || parent.hospital || "";
    const vaccine_name = v.vaccineName || "";
    const dose = v.doseNumber != null ? v.doseNumber : 1;
    const vaccine_id = vaccine_name ? `${vaccine_name}_${dose}` : "";
    const hospital_id = v.centerId || "";
    const dateIso = sched.toISOString();
    const ds = formatNotifDateShort(sched);
    const hospDisp = hospital_name || "your registered hospital";
    if (v.status === "overdue") {
      out.push({
        type: "overdue",
        child_id: parent.childID,
        child_name,
        vaccine_name,
        vaccine_id,
        hospital_id,
        hospital_name,
        date: dateIso,
        message: `Overdue: ${vaccine_name} vaccine was missed on ${ds}. Please visit ${hospDisp}.`,
        created_at: dateIso,
        read: false,
        source: "schedule"
      });
    } else if (v.status === "scheduled" || v.status === "upcoming") {
      if (sched >= today && sched <= horizon) {
        out.push({
          type: "reminder",
          child_id: parent.childID,
          child_name,
          vaccine_name,
          vaccine_id,
          hospital_id,
          hospital_name,
          date: dateIso,
          message: `Reminder: ${child_name} has an upcoming ${vaccine_name} vaccination on ${ds} at ${hospDisp}.`,
          created_at: dateIso,
          read: false,
          source: "schedule"
        });
      }
    }
  }
  return out;
}

/* Generate unique centerId — CTR + 5 random digits */
async function generateCenterId() {
  let id, exists;
  do {
    id = "CTR" + String(Math.floor(10000 + Math.random() * 90000));
    exists = await Center.findOne({ centerId: id });
  } while (exists);
  return id;
}

/* MARK DONE (NEW ENDPOINT) */
app.post("/mark-done", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber, centerId, vaccinatorName } = req.body;
    if (!childID || !vaccineName) return res.status(400).json({ message: "Missing required fields" });

    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    const dateTaken = new Date();
    const certificateId = "VC" + Date.now();

    // Find or create record and update fields
    const center = await Center.findOne({ centerId });

    const record = upsertVaccinationRecord(parent, vaccineName, doseNumber, {
      status: "completed",
      dateTaken: dateTaken,
      hospital: center ? center.name : "",
      centerId: centerId,
      vaccinatorName: vaccinatorName || "",
      certificateId: certificateId
    });

    // Generate QR Data URL
    const qrDataUrl = await QRCode.toDataURL(certificateId);

    // Generate HTML Certificate
    const certificateHTMLContent = generateCertificateHTML(parent, vaccineName, doseNumber, record.hospital, dateTaken, record.vaccinatorName, certificateId, qrDataUrl);
    const emailContent = generateEmailHTML(parent, vaccineName, doseNumber, record.hospital, dateTaken, record.vaccinatorName);

    // Optional: PDF Generation
    let pdfBuffer = null;
    try {
      const browser = await puppeteer.launch({ headless: "new" });
      const page = await browser.newPage();
      await page.setContent(certificateHTMLContent);
      pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await browser.close();
    } catch (pdfErr) {
      console.error("Error generating PDF:", pdfErr);
    }

    // Send Email
    if (parent.email) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: parent.email,
        subject: "Vaccination Certificate – Vaccilink",
        html: emailContent
      };
      if (pdfBuffer) {
        mailOptions.attachments = [{
          filename: `${parent.childName || "Child"}_Vaccination_Certificate.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf"
        }];
      }
      await transporter.sendMail(mailOptions);
    }

    // Also update Appointment if pending
    await Appointment.updateMany({
      childID,
      vaccineName,
      status: { $nin: ["completed", "rejected"] }
    }, { $set: { status: "completed" } });

    await parent.save();
    res.json({ message: "Vaccination marked as done and certificate sent!" });

  } catch (err) {
    console.error("Error in /mark-done:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* ADD SIDE EFFECT */
app.post("/vaccinator/add-effect", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber, effect } = req.body;
    if (!childID || !vaccineName || doseNumber == null) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const parent = await Parent.findOne({ childID });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Child not found" });
    }

    const dose = Number(doseNumber);
    const record = parent.vaccinationHistory.find(
      v => v.vaccineName === vaccineName && Number(v.doseNumber) === dose && v.status === "completed"
    );

    if (!record) {
      return res.status(400).json({ success: false, message: "Completed vaccination record not found" });
    }

    record.postVaccineEffects = (effect || "").trim().substring(0, 150);
    record.updatedAt = new Date();

    await parent.save();
    res.json({ success: true, message: "Effect saved successfully" });
  } catch (err) {
    console.error("Error in /vaccinator/add-effect:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/* SEND OTP */

app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  console.log(`\n--- [Diagnostic] /send-otp route hit ---`);
  console.log(`Recipient: ${email}`);
  console.log(`EMAIL_USER configured as: ${process.env.EMAIL_USER}`);
  console.log(`EMAIL_PASS is present: ${!!process.env.EMAIL_PASS}`);

  if (!email) {
    console.log(`❌ [Diagnostic] No email provided in request body`);
    return res.status(400).json({ message: "Email is required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);
  console.log(`[Diagnostic] OTP generated successfully`);
  otpStore[email] = otp;

  try {
    console.log("EMAIL_USER loaded:", !!process.env.EMAIL_USER);
    console.log("EMAIL_PASS loaded:", !!process.env.EMAIL_PASS);
    console.log("SMTP Config:", JSON.stringify({ host: transporter.options.host, port: transporter.options.port, secure: transporter.options.secure }));
    
    console.log(`[Diagnostic] Testing SMTP connectivity before sending...`);
    await transporter.verify();
    console.log(`[Diagnostic] SMTP verified successfully. Attempting to send email...`);
    
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "VacciLink OTP",
      text: `Your OTP is ${otp}`
    });
    console.log(`✅ [Diagnostic] sendMail success. MessageId: ${info.messageId}`);
    res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error("❌ [Diagnostic] Transporter Error in /send-otp:");
    console.error(err); // Log full error object including code, command, etc.
    res.status(500).json({ message: "Email error", error: err.message, code: err.code, command: err.command });
  }
});

/* VERIFY OTP */

app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (otpStore[email] == otp) {
    delete otpStore[email];
    const parent = await Parent.findOne({ email });
    res.json({ verified: true, childID: parent ? parent.childID : null });
  } else {
    res.json({ verified: false });
  }
});

/* SCANNER OTP FLOW */
let scannerOtpStore = {}; // childID -> { otp, expires, attempts }


app.post("/vaccinator/scan/send-otp", async (req, res) => {
  try {
    let { certificateId } = req.body;
    if (!certificateId) return res.status(400).json({ success: false, message: "Missing QR data" });

    // Robust cleaning: decode, trim, remove all control chars
    let cleanId = decodeURIComponent(String(certificateId)).trim().replace(/[\r\n\t]+/g, "");
    console.log("--- SCAN OTP FLOW ---");
    console.log("RAW SCAN:", certificateId);

    // PHASE 4: Robust extraction
    // Support Token based (t=) or Direct (id=)
    if (cleanId.includes("t=")) {
      try {
        console.log("DETECTED TOKEN (t=) parameter");
        const urlSearch = cleanId.includes("://") ? new URL(cleanId).searchParams : new URLSearchParams(cleanId.substring(cleanId.indexOf("?")));
        const t = urlSearch.get("t");
        if (t) {
          const decoded = JSON.parse(Buffer.from(t, 'base64').toString());
          if (decoded.payload) {
            const payload = typeof decoded.payload === 'string' ? JSON.parse(decoded.payload) : decoded.payload;
            if (payload.childID) {
              cleanId = String(payload.childID);
              console.log("EXTRACTED CHILD ID FROM TOKEN:", cleanId);
            }
          }
        }
      } catch (e) {
        console.log("Token parsing failed, falling back to raw search");
      }
    } else if (cleanId.includes("id=")) {
      try {
        const url = new URL(cleanId);
        cleanId = url.searchParams.get("id");
      } catch (err) {
        const match = cleanId.match(/[?&]id=([^&]+)/);
        if (match) cleanId = match[1];
      }
    }

    cleanId = cleanId.trim();
    console.log("FINAL CLEAN ID:", cleanId);

    // PHASE 4: Robust multi-lookup
    let parent = await Parent.findOne({ childID: cleanId });
    if (!parent && !isNaN(cleanId)) {
      parent = await Parent.findOne({ childID: Number(cleanId) });
    }
    if (!parent) {
      parent = await Parent.findOne({ "vaccinationHistory.certificateId": cleanId });
    }

    console.log("SEARCH MATCHED:", parent ? parent.childID : "NONE");

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found or parent not registered"
      });
    }

    if (!parent.email) {
      return res.status(400).json({
        success: false,
        message: "Parent email missing"
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    scannerOtpStore[parent.childID] = {
      otp,
      expires: Date.now() + 300000,
      attempts: 0
    };

    console.log(`\n--- [Diagnostic] /vaccinator/scan/send-otp route hit ---`);
    console.log(`Recipient: ${parent.email}`);
    console.log(`EMAIL_USER configured as: ${process.env.EMAIL_USER}`);
    console.log(`EMAIL_PASS is present: ${!!process.env.EMAIL_PASS}`);
    console.log("EMAIL_USER loaded:", !!process.env.EMAIL_USER);
    console.log("EMAIL_PASS loaded:", !!process.env.EMAIL_PASS);
    console.log("SMTP Config:", JSON.stringify({ host: transporter.options.host, port: transporter.options.port, secure: transporter.options.secure }));
    
    console.log(`[Diagnostic] Testing SMTP connectivity before sending...`);
    await transporter.verify();
    console.log(`[Diagnostic] SMTP verified successfully. Attempting to send email...`);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: parent.email,
      subject: "Vaccilink Verification OTP",
      text: `Your OTP is ${otp}`
    });

    console.log(`✅ [Diagnostic] sendMail success. MessageId: ${info.messageId}`);

    const emailParts = parent.email.split("@");

    const maskedEmail =
      emailParts[0].substring(0, 2) +
      "***@" +
      emailParts[1];

    res.json({
      success: true,
      childID: parent.childID,
      maskedEmail
    });

  } catch (error) {
    console.error("❌ [Diagnostic] Error in /vaccinator/scan/send-otp:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
      code: error.code,
      command: error.command
    });
  }
});

/* VERIFY SCANNER OTP */
app.post("/vaccinator/scan/verify-otp", async (req, res) => {
  try {
    const { childID, otp } = req.body;

    if (!childID || !otp) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    const record = scannerOtpStore[childID];

    if (!record) {
      return res.status(404).json({ success: false, message: "OTP expired or not requested" });
    }

    if (Date.now() > record.expires) {
      delete scannerOtpStore[childID];
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    if (record.attempts > 5) {
      delete scannerOtpStore[childID];
      return res.status(400).json({ success: false, message: "Too many attempts" });
    }

    if (String(record.otp) !== String(otp)) {
      record.attempts = (record.attempts || 0) + 1;
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // Success - Clear OTP and return redirect URL
    delete scannerOtpStore[childID];
    res.json({
      success: true,
      redirectUrl: `/vaccinator/child-summary.html?childId=${childID}`
    });

  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
/* SIGNUP */

app.post("/signup", async (req, res) => {
  try {
    const {
      parentName,
      email,
      password,
      phone,
      address,
      city,
      pincode,
      childName,
      childDOB,
      motherDOB,
      hospital,
      parentAadhar,
      gender
    } = req.body;

    if (!gender) return res.status(400).json({ message: "Gender required" });

    const childID = String(Math.abs(
      (childName + parentAadhar).split("").reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)
    ) % 90000 + 10000);

    const existing = await Parent.findOne({ email });
    if (existing) {
      return res.json({ message: "User already exists" });
    }

    // ✅ STEP 1: Generate full schedule
    const schedule = generateSchedule(childDOB);

    // ✅ STEP 2: Filter ONLY "At Birth"
    const atBirth = schedule.filter(v => v.age === "At Birth");

    // ✅ STEP 3: Convert to completed records
    const vaccinationHistory = atBirth.map(v => ({
      vaccineName: v.vaccineName,
      doseNumber: v.doseNumber,
      scheduledDate: v.dueDate,
      dateTaken: new Date(childDOB), // taken at birth
      hospital: hospital || "",
      hospitalAddress: "",
      centerId: "",
      status: "completed",
      arrivedToday: false
    }));

    // ✅ STEP 4: Save in DB
    const parent = new Parent({
      parentName,
      email,
      password,
      phone,
      address,
      city,
      pincode,
      childName,
      childDOB,
      motherDOB,
      hospital,
      parentAadhar,
      gender,
      childID,
      vaccinationHistory // 🔥 THIS IS IMPORTANT
    });

    await parent.save();

    // Trigger hospital discovery asynchronously
    discoverNearbyHospitals(address + ", " + city + ", " + pincode).catch(e => console.error("Signup discovery error:", e));

    res.json({ message: "Signup successful", childID });

  } catch (err) {
    console.log(err);
    res.json({ message: "Signup error" });
  }
});

/* LOGIN (EMAIL OR PHONE) */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const parent = await Parent.findOne({ email });

    if (!parent) {
      return res.json({ message: "Invalid login" });
    }

    if (parent.password !== password) {
      return res.json({ message: "Invalid login" });
    }

    // ✅ SUCCESS RESPONSE
    res.json({
      email: parent.email,
      childID: parent.childID,
      parentName: parent.parentName
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* FETCH USER DATA */

app.get("/parent/:email", async (req, res) => {
  const parent = await Parent.findOne({
    $or: [
      { email: req.params.email },
      { phone: req.params.email }
    ]
  });
  if (!parent) return res.json(null);
  res.json(parent);
});

/* UPDATE PARENT LOCATION */
app.put("/parent/update", async (req, res) => {
  try {
    const { email, address, city, pincode } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const update = {};
    if (address !== undefined) update.address = address;
    if (city !== undefined) update.city = city;
    if (pincode !== undefined) update.pincode = pincode;

    const parent = await Parent.findOneAndUpdate(
      { email },
      { $set: update },
      { new: true }
    );

    if (!parent) return res.status(404).json({ message: "Parent not found" });

    if (address || city || pincode) {
      const fullAddr = [address, city, pincode].filter(Boolean).join(", ") || parent.address;
      discoverNearbyHospitals(fullAddr).catch(e => console.error("Update discovery error:", e));
    }
    res.json({ message: "Profile updated successfully", parent });
  } catch (err) {
    console.error("Error updating parent:", err);
    res.status(500).json({ message: "Error updating parent profile" });
  }
});

/** Stable verify URL for Digital Health ID QR (client passes origin = window.location.origin) */
app.get("/parent/qr-verify-url/:childID", async (req, res) => {
  try {
    const { childID } = req.params;
    const origin = String(req.query.origin || "").trim();
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });
    const secret = await ensureQrSecret(parent);
    const base = process.env.PUBLIC_BASE_URL || "https://vaccilink-final.onrender.com";
    res.json({
      verify_url: buildVerifyQrUrl(base, childID, secret),
      child_id: childID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error building QR URL" });
  }
});

/* SECURE QR API */
app.get("/api/parent/secure-qr/:childID", async (req, res) => {
  try {
    const { childID } = req.params;
    const origin = req.query.origin || process.env.PUBLIC_BASE_URL || "https://vaccilink-final.onrender.com";
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    const payload = JSON.stringify({ childID, timestamp: Date.now() });
    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    sign.end();
    const signature = sign.sign(privateKey, 'base64');

    const tokenData = Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
    const scanUrl = `${origin}/vaccinator/verify-scan.html?t=${tokenData}`;

    const qrImageBase64 = await QRCode.toDataURL(scanUrl);

    res.json({ payload, signature, childID, qrImage: qrImageBase64, scanUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error building secure QR" });
  }
});

app.post("/api/verify-secure-qr", async (req, res) => {
  try {
    const { payload, signature, token } = req.body;
    let finalPayload = payload;
    let finalSignature = signature;

    if (token) {
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        finalPayload = decoded.payload;
        finalSignature = decoded.signature;
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid token format." });
      }
    }

    if (!finalPayload || !finalSignature) {
      return res.status(400).json({ success: false, message: "Missing payload or signature" });
    }

    const verify = crypto.createVerify('SHA256');
    verify.update(finalPayload);
    verify.end();

    const isValid = verify.verify(publicKey, finalSignature, 'base64');
    if (!isValid) {
      return res.status(400).json({ success: false, message: "QR Code verification failed: Signature mismatch." });
    }

    const parsed = JSON.parse(finalPayload);
    res.json({ success: true, childID: parsed.childID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error verifying QR" });
  }
});

/* VACCINATION APIs */

app.get("/vaccination/:childID", async (req, res) => {
  try {
    const parent = await Parent.findOne({ childID: req.params.childID });
    if (!parent) return res.json([]);
    res.json(parent.vaccinationHistory);
  } catch (err) {
    console.log(err);
    res.json([]);
  }
});

app.post("/vaccination/add", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber, scheduledDate, dateTaken, hospital, hospitalAddress, distance, status, centerId } = req.body;
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.json({ message: "Parent not found" });

    let record = parent.vaccinationHistory.find(v => v.vaccineName === vaccineName && v.doseNumber == doseNumber);
    if (record) {
      if (scheduledDate) record.scheduledDate = new Date(scheduledDate);
      if (dateTaken) record.dateTaken = new Date(dateTaken);
      if (hospital) record.hospital = hospital;
      if (hospitalAddress) record.hospitalAddress = hospitalAddress;
      if (distance) record.distance = distance;
      if (status) record.status = status;
      if (centerId) record.centerId = centerId;
    } else {
      parent.vaccinationHistory.push({
        vaccineName,
        doseNumber,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        dateTaken: dateTaken ? new Date(dateTaken) : null,
        hospital: hospital || "",
        hospitalAddress: hospitalAddress || "",
        centerId: centerId || "",
        distance: distance || "",
        status: status || ""
      });
    }

    await parent.save();

    // If it's a scheduled online appointment, create the Appointment record
    if (status === "scheduled" && scheduledDate && centerId) {
      const existingAppt = await Appointment.findOne({ childID, vaccineName, appointmentDate: new Date(scheduledDate) });
      if (!existingAppt) {
        const newAppt = new Appointment({
          childName: parent.childName,
          childID: parent.childID,
          parentPhone: parent.phone,
          vaccineName,
          doseNumber: doseNumber != null ? Number(doseNumber) : getDoseNumberForVaccine(parent.childDOB, vaccineName),
          appointmentDate: new Date(scheduledDate),
          hospital,
          hospitalAddress,
          centerId,
          status: "pending",
          type: "online"
        });
        await newAppt.save();
      }
    }
    res.json({ message: "Vaccination added/updated successfully" });
  } catch (err) {
    console.log(err);
    res.json({ message: "Error updating vaccination" });
  }
});

/* Helper: discover and save nearby hospitals via Geoapify */
async function discoverNearbyHospitals(address) {
  if (!address) return [];

  const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;
  if (!GEOAPIFY_API_KEY) {
    console.error("Geoapify API key missing");
    return [];
  }

  async function resolveCenter(name, addr, pincode = "", city = "", lat, lon) {
    const cleanName = name.trim();
    const cleanAddr = addr.trim();
    let center = await Center.findOne({ name: cleanName, address: cleanAddr });
    if (!center) {
      const newId = await generateCenterId();
      center = new Center({
        centerId: newId,
        name: cleanName,
        address: cleanAddr,
        pincode: pincode ? String(pincode).trim() : "",
        city: city ? String(city).trim() : "",
        latitude: lat,
        longitude: lon
      });
      await center.save();
    }
    return center;
  }

  function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  }

  try {
    // Step 1: Geocode address using Geoapify
    const geocodeUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&limit=1&apiKey=${GEOAPIFY_API_KEY}`;
    const geoResp = await fetch(geocodeUrl);

    if (!geoResp.ok) {
      console.error("[Nearby Clinics] Geoapify geocoding failed:", geoResp.status);
      return [];
    }

    const geoData = await geoResp.json();
    if (!geoData.features || geoData.features.length === 0) return [];

    console.log("[Nearby Clinics] Geoapify geocode success");

    const geocodeFeature = geoData.features[0].properties;
    const lat = geocodeFeature.lat;
    const lon = geocodeFeature.lon;
    const geoCity = geocodeFeature.city || geocodeFeature.county || "";
    const geoPincode = geocodeFeature.postcode || "";

    // Step 2: Search hospitals within 5km radius using Geoapify Places
    const radius = 5000;
    const placesUrl = `https://api.geoapify.com/v2/places?categories=healthcare.hospital&filter=circle:${lon},${lat},${radius}&limit=20&apiKey=${GEOAPIFY_API_KEY}`;

    const placesResp = await fetch(placesUrl);
    if (!placesResp.ok) {
      console.error("[Nearby Clinics] Geoapify Places API failed:", placesResp.status);
      return [];
    }

    const placesData = await placesResp.json();
    const elements = placesData.features || [];
    const discovered = [];

    for (const el of elements) {
      const props = el.properties || {};
      let name = props.name || props.name_en || "";
      if (!name) continue;

      const text = [
        name,
        props.categories ? props.categories.join(" ") : "",
        props.address_line2 || ""
      ].join(" ").toLowerCase();

      // STRICT: block irrelevant categories first
      const blockedKeywords = [
        "eye", "netralaya", "ophthalmic", "ophthalmology", "dental", "tooth",
        "veterinary", "pet", "animal", "skin", "derma", "ent",
        "physiotherapy", "physio", "lab", "pathology", "diagnostic", "xray", "scan", "clinic"
      ];
      if (blockedKeywords.some(kw => text.includes(kw))) continue;

      // ALLOW only proper hospitals
      const allowedKeywords = [
        "hospital", "government", "general", "private", "district",
        "children", "medical college", "multispeciality", "apollo", "ruby hall", "city hospital"
      ];
      if (!allowedKeywords.some(kw => text.includes(kw))) continue;

      name = name.replace(/^[A-Z]\s+/, "").trim();
      const elLat = props.lat;
      const elLon = props.lon;

      const street = props.street || "";
      const houseNo = props.housenumber || "";
      const city = props.city || geoCity || "";
      const pincode = props.postcode || geoPincode || "";

      const parts = [houseNo, street, city].filter(Boolean);
      const rawAddr = parts.length > 0 ? parts.join(", ") : props.address_line2 || address;

      const center = await resolveCenter(name, rawAddr, pincode, city, elLat, elLon);
      const distance = calcDistance(lat, lon, elLat, elLon);

      discovered.push({
        centerId: center.centerId,
        name: center.name,
        address: center.address,
        latitude: elLat,
        longitude: elLon,
        distance: distance + " km",
        distNum: parseFloat(distance)
      });
    }

    const seen = new Set();
    const unique = [];
    discovered.sort((a, b) => a.distNum - b.distNum).forEach(d => {
      if (!seen.has(d.centerId)) {
        seen.add(d.centerId);
        unique.push(d);
      }
    });

    console.log(`[Nearby Clinics] Geoapify hospitals found: ${unique.length}`);
    return unique.slice(0, 10);
  } catch (err) {
    console.error(`[Nearby Clinics] Discovery Error: ${err.message}`);
    return [];
  }
}

app.get("/nearby-clinics/:email", async (req, res) => {
  console.log(`\n[Nearby Clinics] Request received`);
  try {
    const parent = await Parent.findOne({ email: req.params.email });

    if (!parent) {
      return res.json([]);
    }
    console.log(`[Nearby Clinics] Parent found: ${parent.email}, City: ${parent.city}`);

    const fullAddress = [parent.address, parent.city, parent.pincode]
      .filter(Boolean).join(", ");

    let clinics = await discoverNearbyHospitals(fullAddress);

    if (!clinics || clinics.length === 0) {
      if (parent.city) {
        clinics = await Center.find({ city: new RegExp(parent.city, "i") }).limit(10);
      } else {
        clinics = [];
      }
      console.log(`[Nearby Clinics] Mongo fallback count: ${clinics.length}`);
    }

    return res.json(clinics || []);

  } catch (err) {
    console.error("[Nearby Clinics] Error occurred:", err.message);
    try {
      const parent = await Parent.findOne({ email: req.params.email });
      if (parent && parent.city) {
        const fallback = await Center.find({ city: new RegExp(parent.city, "i") }).limit(10);
        console.log(`[Nearby Clinics] Mongo fallback count: ${fallback.length}`);
        return res.json(fallback);
      }
    } catch (fallbackErr) {
      console.error("[Nearby Clinics] Fallback error:", fallbackErr.message);
    }
    return res.json([]);
  }
});
/* GET ALL CENTERS (with optional pincode / city filter) */
app.get("/centers", async (req, res) => {
  try {
    const filter = {};
    if (req.query.pincode) filter.pincode = req.query.pincode;
    if (req.query.city) filter.city = new RegExp(req.query.city, "i");
    const centers = await Center.find(filter).sort({ name: 1 });
    res.json(centers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching centers" });
  }
});

/* VACCINATOR DASHBOARD API */
app.get("/vaccinator/dashboard", async (req, res) => {
  try {
    const { centerId } = req.query;
    if (!centerId) return res.status(400).json({ message: "centerId is required" });

    // For vaccinations, we filter parents who have an appointment at this center 
    // OR we could just fetch all parents for the demo, but true access control means we only see parents linked to this center.
    // Let's filter parents based on appointments or a primary center.
    // A simplified approach for now is fetching all parents but only showing them if they have a scheduled vaccination at this centerId OR are overdue (and we might tie overdues to all vaccinators or a specific default).
    // Let's just retrieve parents who booked here.
    const allAppointments = await Appointment.find({ centerId });
    const childIDsWithAppointments = [...new Set(allAppointments.map(a => a.childID))];

    // Get only parents that have appointments with this center or have visited it before
    const parents = await Parent.find({
      $or: [
        { childID: { $in: childIDsWithAppointments } },
        { "vaccinationHistory.hospital": centerId }
      ]
    });

    const appointments = await Appointment.find({ centerId });
    let dashboardData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Process vaccinations from parent history
    parents.forEach(p => {
      const schedule = generateSchedule(p.childDOB);
      const merged = mergeHistory(schedule, p.vaccinationHistory);

      merged.forEach(v => {
        const schDate = v.scheduledDate || v.dueDate;
        const isToday = schDate && new Date(schDate).toDateString() === today.toDateString();

        const dbRecord = p.vaccinationHistory.find(h => h.vaccineName === v.vaccineName && h.doseNumber === v.doseNumber);

        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

        const isCompletedRecent =
          dbRecord?.dateTaken &&
          new Date(dbRecord.dateTaken) >= fiveDaysAgo;

        // Include Overdue, Today's scheduled, Upcoming, and Completed Today
        if (v.status === "overdue" || (v.status === "scheduled" && isToday) || v.status === "upcoming" || isCompletedRecent) {
          dashboardData.push({
            id: dbRecord ? dbRecord._id : null,
            childName: p.childName,
            childID: p.childID,
            parentPhone: p.phone,
            vaccineName: v.vaccineName,
            doseNumber: v.doseNumber,
            scheduledDate: isCompletedRecent ? v.dateTaken : schDate,
            status: isCompletedRecent ? "Completed" : (isToday ? "Today" : (v.status === "overdue" ? "Overdue" : "Upcoming")),
            arrivedToday: dbRecord ? dbRecord.arrivedToday : false,
            type: "vaccination",
            dateTaken: dbRecord?.dateTaken || null,
            hospital: dbRecord?.hospital || "",
            centerId: dbRecord?.centerId || ""
          });
        }
      });
    });

    // Process appointments (link to parent row for arrivedToday / dose)
    appointments.forEach(a => {
      if (a.status === "completed" || a.status === "rejected") return;
      const apptDate = new Date(a.appointmentDate);
      const isToday = apptDate.toDateString() === today.toDateString();
      const diffDays = Math.ceil((apptDate - today) / (1000 * 60 * 60 * 24));

      const parentRow = parents.find(p => p.childID === a.childID);
      const doseNum = a.doseNumber != null ? Number(a.doseNumber) : (parentRow ? getDoseNumberForVaccine(parentRow.childDOB, a.vaccineName) : 1);
      let arrivedToday = false;
      if (parentRow) {
        const h = parentRow.vaccinationHistory.find(
          x => x.vaccineName === a.vaccineName && Number(x.doseNumber) === doseNum
        );
        arrivedToday = Boolean(h?.arrivedToday);
      }

      if (isToday || (diffDays > 0 && diffDays <= 7) || a.status === "pending") {
        dashboardData.push({
          id: a._id,
          childName: a.childName,
          childID: a.childID,
          parentPhone: a.parentPhone,
          vaccineName: a.vaccineName,
          doseNumber: doseNum,
          scheduledDate: a.appointmentDate,
          status: isToday ? "Today" : "Upcoming",
          appointmentStatus: a.status,
          type: "appointment",
          hospital: a.hospital,
          centerId: a.centerId || "",
          arrivedToday
        });
      }
    });

    // Remove duplicates from dashboardData (we might have same child scheduled from both lists)
    const uniqueDashboardData = [];
    const seen = new Set();
    for (const item of dashboardData) {
      // Prioritize "type" based on UI. If it's appointment type we can keep it.
      const key = `${item.childID}_${item.vaccineName}_${item.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueDashboardData.push(item);
      }
    }

    // Sort by priority: Overdue > Today > Upcoming
    const priority = { "Overdue": 1, "Today": 2, "Upcoming": 3 };
    uniqueDashboardData.sort((a, b) => (priority[a.status] || 99) - (priority[b.status] || 99));

    // ✅ New return format: bucketed lists
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const weekEnd = new Date(todayDate);
    weekEnd.setDate(todayDate.getDate() + 7);

    const parseItemDate = (item) => {
      const d = item.scheduledDate ? new Date(item.scheduledDate) : null;
      if (!d || isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const notCompleted = (item) => {
      if (item.type === "appointment") return item.appointmentStatus !== "completed";
      // vaccination items don't have appointmentStatus; treat "Completed Today" as completed
      return item.status !== "Completed Today";
    };

    const buckets = { today: [], week: [], upcoming: [], overdue: [] };
    uniqueDashboardData.forEach((item) => {
      const d = parseItemDate(item);
      if (!d) return;

      if (d.getTime() === todayDate.getTime()) {
        buckets.today.push(item);
      } else if (d > todayDate && d <= weekEnd) {
        buckets.week.push(item);
      } else if (d < todayDate && notCompleted(item)) {
        buckets.overdue.push(item);
      } else if (d > todayDate) {
        buckets.upcoming.push(item);
      }
    });

    // Sort overdue first, then today, then upcoming (within each bucket by date asc)
    const byDateAsc = (a, b) => {
      const da = parseItemDate(a)?.getTime() || 0;
      const db = parseItemDate(b)?.getTime() || 0;
      return da - db;
    };
    buckets.overdue.sort(byDateAsc);
    buckets.today.sort(byDateAsc);
    buckets.week.sort(byDateAsc);
    buckets.upcoming.sort(byDateAsc);

    res.json(buckets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching dashboard data" });
  }
});

/* GET VACCINATOR DASHBOARD (Enhanced Table View) */
function formatAge(dob) {
  if (!dob) return "Not Added";

  const birthDate = new Date(dob);
  const today = new Date();

  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  let days = today.getDate() - birthDate.getDate();

  if (days < 0) {
    months--;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const totalDays = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(totalDays / 7);

  if (years <= 0 && months <= 0) {
    return `${weeks} Week${weeks !== 1 ? "s" : ""}`;
  }

  if (years <= 0) {
    return `${months} Month${months !== 1 ? "s" : ""}`;
  }

  if (months === 0) {
    return `${years} Year${years !== 1 ? "s" : ""}`;
  }

  return `${years} Year${years !== 1 ? "s" : ""} ${months} Month${months !== 1 ? "s" : ""}`;
}

app.get("/vaccinator/dashboard/:centerId", async (req, res) => {
  try {
    const { centerId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allParents = await Parent.find().lean();
    const allAppointments = await Appointment.find({ centerId }).lean();

    let tableData = [];
    const consumedAppointmentIds = new Set();

    allParents.forEach(p => {
      const schedule = generateSchedule(p.childDOB);
      const merged = mergeHistory(schedule, p.vaccinationHistory);
      const formattedAge = formatAge(p.childDOB || p.dob || p.dateOfBirth);

      merged.forEach(v => {
        const schDate = v.scheduledDate || v.dueDate;
        const vDate = schDate ? new Date(schDate) : null;
        if (vDate) vDate.setHours(0, 0, 0, 0);

        const isTodaySch = vDate && vDate.getTime() === today.getTime();
        const isOverdueSch = vDate && vDate < today && v.status !== "completed";

        // Check for specific appointment
        const appt = allAppointments.find(a =>
          a.childID === p.childID &&
          a.vaccineName === v.vaccineName &&
          Number(a.doseNumber) === Number(v.doseNumber)
        );

        let finalStatus = v.status;
        let finalDate = schDate;

        if (appt) {
          consumedAppointmentIds.add(String(appt._id));
          const aDate = new Date(appt.appointmentDate);
          aDate.setHours(0, 0, 0, 0);
          finalDate = appt.appointmentDate;

          if (appt.status === "completed") finalStatus = "completed";
          else if (aDate.getTime() === today.getTime()) finalStatus = "Today";
          else if (aDate < today) finalStatus = "Overdue";
          else finalStatus = "Upcoming";
        } else {
          if (v.status === "completed") finalStatus = "completed";
          else if (isTodaySch) finalStatus = "Today";
          else if (isOverdueSch) finalStatus = "Overdue";
          else finalStatus = "Upcoming";
        }

        let shouldInclude = false;
        if (appt) shouldInclude = true;
        if (isTodaySch) shouldInclude = true;
        if (isOverdueSch) shouldInclude = true;
        if (v.status === "completed" && v.centerId === centerId) shouldInclude = true;

        if (shouldInclude) {
          tableData.push({
            childName: p.childName,
            parentName: p.parentName || "N/A",
            childDOB: p.childDOB,
            age: formattedAge,
            gender: (p.gender && p.gender !== "Unknown" && p.gender !== "Any") ? p.gender : (appt?.gender || "Unknown"),
            address: p.address || "N/A",
            vaccineName: v.vaccineName,
            doseNumber: v.doseNumber,
            appointmentDate: finalDate,
            dateTaken: v.dateTaken,
            status: finalStatus,
            childID: p.childID,
            phone: p.phone
          });
        }
      });
    });

    // Add unmatched/orphaned appointments
    const unmatched = allAppointments.filter(a => !consumedAppointmentIds.has(String(a._id)) && a.status !== "completed");
    for (const appt of unmatched) {
      const p = allParents.find(px => px.childID === appt.childID) || {};
      const aDate = new Date(appt.appointmentDate);
      aDate.setHours(0, 0, 0, 0);

      let finalStatus = "Upcoming";
      if (aDate.getTime() === today.getTime()) finalStatus = "Today";
      else if (aDate < today) finalStatus = "Overdue";

      tableData.push({
        childName: appt.childName || p.childName || "Unknown",
        parentName: p.parentName || "N/A",
        childDOB: p.childDOB || "",
        age: formatAge(p.childDOB),
        gender: appt.gender || p.gender || "Unknown",
        address: p.address || "N/A",
        vaccineName: appt.vaccineName,
        doseNumber: appt.doseNumber,
        appointmentDate: appt.appointmentDate,
        status: finalStatus,
        childID: appt.childID,
        phone: appt.parentPhone || p.phone || ""
      });
    }

    // Sort: Today first, then Upcoming (by date), then others
    const statusPriority = { "Today": 1, "Upcoming": 2, "Overdue": 3, "completed": 4 };
    tableData.sort((a, b) => {
      const pA = statusPriority[a.status] || 99;
      const pB = statusPriority[b.status] || 99;
      if (pA !== pB) return pA - pB;
      return new Date(a.appointmentDate) - new Date(b.appointmentDate);
    });

    res.json(tableData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching table data" });
  }
});

/* GET APPOINTMENTS BY CENTER ID (For Vaccinator) */
app.get("/appointments/center/:centerId", async (req, res) => {
  try {
    const { centerId } = req.params;
    const appointments = await Appointment.find({ centerId }).sort({ appointmentDate: 1 });

    const formatted = appointments.map(a => ({
      childName: a.childName,
      vaccine: a.vaccineName,
      date: a.appointmentDate,
      hospital: a.hospital,
      status: a.status
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching center appointments" });
  }
});

/* GET ALL APPOINTMENTS FOR A CHILD (PARENTS VIEW) */
app.get("/appointments/all/:childID", async (req, res) => {
  try {
    const { childID } = req.params;
    const appointments = await Appointment.find({ childID }).sort({ appointmentDate: -1 });
    res.json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

/** Next upcoming appointment for parent profile (query: child_id) */
app.get("/api/appointments", async (req, res) => {
  try {
    const child_id = req.query.child_id;
    if (!child_id) return res.status(400).json({ message: "child_id is required" });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const list = await Appointment.find({
      childID: String(child_id),
      status: { $nin: ["completed", "rejected"] },
      appointmentDate: { $gte: now }
    }).sort({ appointmentDate: 1 });

    const next = list[0] || null;
    if (!next) {
      return res.json({ next: null });
    }

    const apptDate = new Date(next.appointmentDate);
    const timeStr = (next.appointmentTime && String(next.appointmentTime).trim())
      ? next.appointmentTime
      : (apptDate.getHours() || apptDate.getMinutes()
        ? apptDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
        : "");

    res.json({
      next: {
        vaccine_name: next.vaccineName || "",
        date: apptDate.toISOString(),
        time: timeStr,
        hospital_name: next.hospital || "",
        hospital_id: next.centerId || "",
        dose_number: next.doseNumber
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching next appointment" });
  }
});

/** Latest completed vaccination visit (consultation-style) */
app.get("/api/consultations/latest", async (req, res) => {
  try {
    const child_id = req.query.child_id;
    if (!child_id) return res.status(400).json({ message: "child_id is required" });

    const parent = await Parent.findOne({ childID: String(child_id) });
    if (!parent) {
      return res.json({ latest: null });
    }

    const merged = mergeHistory(generateSchedule(parent.childDOB), parent.vaccinationHistory);
    const completed = merged
      .filter(v => v.status === "completed" && v.dateTaken)
      .map(v => ({ ...v, dt: new Date(v.dateTaken) }))
      .filter(v => !isNaN(v.dt.getTime()))
      .sort((a, b) => b.dt - a.dt);

    const last = completed[0] || null;
    if (!last) {
      return res.json({ latest: null });
    }

    const docLabel = last.vaccinatorID
      ? `Vaccinator (${last.vaccinatorID})`
      : "Vaccination provider";

    res.json({
      latest: {
        doctor_name: docLabel,
        hospital_name: last.hospital || parent.hospital || "",
        visited_date: last.dt.toISOString(),
        vaccine_name: last.vaccineName || ""
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching consultation" });
  }
});

/* GET PAST APPOINTMENTS FOR A CHILD */
app.get("/appointments/past/:childID", async (req, res) => {
  try {
    const { childID } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments = await Appointment.find({ childID }).sort({ appointmentDate: -1 });
    const past = appointments.filter(a => new Date(a.appointmentDate) < today);

    res.json(past);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching past appointments" });
  }
});

/* GET WEEKLY APPOINTMENTS */
app.get("/appointments/week", async (req, res) => {
  try {
    const { centerId } = req.query;
    if (!centerId) return res.status(400).json({ message: "centerId is required" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const appointments = await Appointment.find({
      centerId,
      appointmentDate: { $gte: today, $lte: nextWeek }
    }).sort({ appointmentDate: 1 });

    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: "Error fetching weekly appointments" });
  }
});

/* VACCINATOR APPOINTMENTS API (ALL) */
app.get("/vaccinator/appointments", async (req, res) => {
  try {
    const { centerId } = req.query;
    if (!centerId) return res.status(400).json({ message: "centerId is required" });

    const appointments = await Appointment.find({ centerId }).sort({ appointmentDate: 1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: "Server error updating appointment" });
  }
});

/* SEND REMINDER API */
app.post("/vaccinator/send-reminder", async (req, res) => {
  try {
    const {
      childID,
      centerName,
      childName,
      parentEmail,
      vaccineName,
      doseNumber,
      dueDate,
      hospitalName,
      centerId,
      scheduledDate,
      notifType: notifTypeBody
    } = req.body || {};

    // Support both payload shapes:
    // 1) { childID, centerName, ... }  (dashboard)
    // 2) { childName, parentEmail, vaccineName, doseNumber, dueDate } (follow-up page)
    let parent = null;
    if (childID) parent = await Parent.findOne({ childID });
    if (!parent && parentEmail) parent = await Parent.findOne({ email: parentEmail });

    const toEmail = parent?.email || parentEmail;
    if (!toEmail) return res.status(404).json({ message: "Parent email not found" });

    const finalChildID = parent?.childID || childID || "";
    const finalChildName = parent?.childName || childName || "your child";

    const bodyType = String(notifTypeBody || "").toLowerCase();
    const followupOverdue = Boolean(dueDate && vaccineName);
    let notifType =
      bodyType === "overdue" || bodyType === "reminder"
        ? bodyType
        : followupOverdue
          ? "overdue"
          : "reminder";

    const hospLabel = hospitalName || centerName || parent?.hospital || "your registered center";
    const cid = centerId || "";

    let eventDate = new Date();
    if (followupOverdue && dueDate) {
      const parsed = new Date(dueDate);
      if (!isNaN(parsed.getTime())) eventDate = parsed;
    } else if (scheduledDate) {
      const parsed = new Date(scheduledDate);
      if (!isNaN(parsed.getTime())) eventDate = parsed;
    }

    const doseNum = doseNumber != null && doseNumber !== "" ? Number(doseNumber) : undefined;
    const ds = formatNotifDateShort(eventDate);
    let structuredMessage;
    if (notifType === "overdue") {
      structuredMessage = `Overdue: ${vaccineName || "Vaccine"} vaccine was missed on ${ds}. Please visit ${hospLabel}.`;
    } else if (vaccineName || scheduledDate) {
      structuredMessage = `Reminder: ${finalChildName} has an upcoming ${vaccineName || "vaccination"}${doseNum ? ` (Dose ${doseNum})` : ""} on ${ds} at ${hospLabel}.`;
    } else {
      structuredMessage = `Reminder: ${finalChildName} has an upcoming vaccination. Please book or confirm at ${hospLabel}.`;
    }

    const mailText = `Dear Parent,\n\n${structuredMessage}\n\nRegards,\nVacciLink Team`;

    await transporter.sendMail({
      from: "hospitrack58@gmail.com",
      to: toEmail,
      subject: "Vaccination Reminder",
      text: mailText
    });

    if (finalChildID) {
      await Notification.create({
        childID: finalChildID,
        childName: finalChildName,
        vaccineName: vaccineName || (notifType === "reminder" ? "" : ""),
        doseNumber: doseNum,
        centerId: cid,
        hospitalName: hospLabel,
        eventDate,
        type: notifType,
        message: structuredMessage
      });
    }

    res.json({ message: "Reminder sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error sending reminder" });
  }
});

/* GET NOTIFICATIONS FOR A CHILD */
app.get("/notifications/:childID", async (req, res) => {
  try {
    const { childID } = req.params;
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.json([]);

    const stored = await Notification.find({ childID }).sort({ date: -1 });
    const merged = mergeHistory(generateSchedule(parent.childDOB), parent.vaccinationHistory);
    const derived = buildDerivedScheduleNotifications(parent, merged);

    const fromDb = stored.map(d => notificationDocToStructuredApi(d, parent.childName));
    const keys = new Set(fromDb.map(notifDedupeKey));
    const combined = [...fromDb];
    for (const d of derived) {
      const k = notifDedupeKey(d);
      if (!keys.has(k)) {
        combined.push(d);
        keys.add(k);
      }
    }
    combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(combined);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
});

/* UPDATE APPOINTMENT STATUS */
app.put("/vaccinator/appointment/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const appointment = await Appointment.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json({ message: "Status updated successfully", appointment });
  } catch (err) {
    res.status(500).json({ message: "Error updating appointment status" });
  }
});

/* ONSITE REGISTRATION API */
app.post("/vaccinator/onsite-register", async (req, res) => {
  try {
    const { childName, childDOB, parentName, phone, address, vaccineName, centerId, gender } = req.body || {};
    const cleanPhone = String(phone || "").trim();
    const cleanChild = String(childName || "").trim();
    if (!cleanChild || !cleanPhone || !vaccineName || !centerId) {
      return res.status(400).json({ message: "childName, phone, vaccineName, centerId are required" });
    }
    if (cleanPhone.length < 10) {
      return res.status(400).json({ message: "Please enter a valid phone number" });
    }

    let parent = await Parent.findOne({ phone: cleanPhone, childName: cleanChild });

    if (!parent) {
      const childID = String(
        Math.abs(
          (cleanChild + cleanPhone)
            .split("")
            .reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)
        ) % 90000 + 10000
      );

      parent = new Parent({
        parentName: String(parentName || "").trim(),
        phone: cleanPhone,
        address: String(address || "").trim(),
        childName: cleanChild,
        childDOB: childDOB || "",
        gender: gender || "Unknown",
        childID
      });
      await parent.save();
    } else {
      if (parentName) parent.parentName = parentName;
      if (address && !parent.address) parent.address = address;
      if (childDOB && !parent.childDOB) parent.childDOB = childDOB;
      if (gender && (!parent.gender || parent.gender === "Unknown")) parent.gender = gender;
      await parent.save();
    }

    const center = await Center.findOne({ centerId });
    const hospitalName = center ? center.name : "";
    const hospitalAddress = center?.address || "";

    const doseNumber = getDoseNumberForVaccine(parent.childDOB, vaccineName);
    const visitTime = new Date();

    upsertVaccinationRecord(parent, vaccineName, doseNumber, {
      status: "completed",
      dateTaken: visitTime,
      hospital: hospitalName,
      hospitalAddress,
      centerId,
      arrivedToday: true,
      visitDate: visitTime
    });

    await parent.save();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newAppt = new Appointment({
      childName: parent.childName,
      childID: parent.childID,
      parentPhone: parent.phone,
      vaccineName,
      doseNumber,
      appointmentDate: today,
      hospital: hospitalName,
      hospitalAddress,
      centerId,
      status: "completed",
      type: "onsite"
    });

    await newAppt.save();

    res.json({ message: "Walk-in registered and vaccination recorded", childID: parent.childID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error registering onsite" });
  }
});

/* GET CHILD DETAILS */
app.get("/child/:id", async (req, res) => {
  try {
    const parent = await Parent.findOne({ childID: req.params.id });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    const schedule = generateSchedule(parent.childDOB);
    const merged = mergeHistory(schedule, parent.vaccinationHistory);

    res.json({
      childName: parent.childName,
      childID: parent.childID,
      dob: parent.childDOB,
      parentName: parent.parentName,
      parentPhone: parent.phone,
      address: parent.address,
      vaccinationHistory: merged
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching child profile" });
  }
});

app.get("/vaccinator/child-summary/:childId", async (req, res) => {
  try {
    const childId = String(req.params.childId).trim();

    const child = await Parent.findOne({
      $or: [
        { childID: childId },
        { childID: Number(childId) }
      ]
    });

    if (!child) {
      return res.json({ success: false, message: "Child not found" });
    }

    res.json({ success: true, child });

  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Server error" });
  }
});
/* MARK ARRIVED */
app.put("/vaccination/arrived/:childID/:vaccineName/:doseNumber", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber } = req.params;
    const arrived =
      req.body?.arrived === true ||
      req.body?.arrived === "true" ||
      req.body?.arrived === 1 ||
      req.body?.arrived === "1";
    const explicitFalse =
      req.body?.arrived === false ||
      req.body?.arrived === "false" ||
      req.body?.arrived === 0 ||
      req.body?.arrived === "0";
    const arrivedFinal = explicitFalse ? false : arrived;

    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    const decodedName = decodeURIComponent(vaccineName);
    const record = upsertVaccinationRecord(parent, decodedName, doseNumber, {});
    record.arrivedToday = arrivedFinal;
    if (arrivedFinal) {
      record.visitDate = new Date();
    } else {
      record.visitDate = null;
    }

    await parent.save();
    res.json({ message: "Arrival status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating arrival status" });
  }
});


/* MARK COMPLETED */
app.put("/vaccination/complete/:childID/:vaccineName/:doseNumber", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber } = req.params;
    const { centerId, hospital, vaccinatorName } = req.body || {};
    const decodedName = decodeURIComponent(vaccineName);

    console.log("Vaccination completed for child:", childID);

    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ success: false, message: "Child not found" });

    const taken = new Date();
    const certId = `VACC-2026-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-4)}`;

    const verifyBase = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host") || "vaccilink-final.onrender.com"}`;
    const verifyUrl = `${verifyBase}/verify.html?id=${certId}`;
    let qrCodeBase64 = "";
    try {
      qrCodeBase64 = await QRCode.toDataURL(verifyUrl);
    } catch (e) {
      console.error("QR Code Error:", e);
    }

    const record = upsertVaccinationRecord(parent, decodedName, doseNumber, {
      status: "completed",
      dateTaken: taken,
      certificateId: certId,
      issuedAt: taken,
      qrCode: qrCodeBase64,
      vaccinatorName: vaccinatorName || ""
    });
    if (centerId) record.centerId = centerId;
    if (hospital) record.hospital = hospital;

    const apptQ = {
      childID,
      vaccineName: decodedName,
      status: { $nin: ["completed", "rejected"] }
    };
    if (centerId) apptQ.centerId = centerId;
    await Appointment.updateMany(apptQ, { $set: { status: "completed" } });

    await parent.save();

    // EMAIL WORKFLOW
    let emailWarning = null;
    if (parent.email) {
      console.log("Parent email:", parent.email);
      console.log("Generating certificate...");

      const certificateHTML = generateCertificateHTML(
        parent,
        decodedName,
        doseNumber,
        hospital || centerId || "Health Center",
        taken,
        vaccinatorName || "Authorized Vaccinator",
        certId,
        qrCodeBase64
      );

      let pdfBuffer = null;
      try {
        const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(certificateHTML);
        pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
        await browser.close();
        console.log("Certificate generated");
      } catch (pdfErr) {
        console.error("PDF generation failed:", pdfErr);
      }

      try {
        const mailOptions = {
          from: "hospitrack58@gmail.com",
          to: parent.email,
          subject: "Vaccination Completed - Certificate Attached",
          text: `Hello ${parent.parentName || "Parent"},\n\nYour child ${parent.childName || "Child"} has successfully received ${decodedName}.\n\nPlease find the vaccination certificate attached.\n\nRegards,\nVacciLink`
        };

        if (pdfBuffer) {
          mailOptions.attachments = [{
            filename: `${(parent.childName || "Child").replace(/\s+/g, '_')}_Certificate.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf"
          }];
        }

        await transporter.sendMail(mailOptions);
        console.log("Email sent successfully");
      } catch (mailErr) {
        console.error("Email failed:", mailErr);
      }
    } else {
      console.log("Parent email missing for child:", childID);
      emailWarning = "Completed but email missing";
    }

    res.json({
      success: true,
      message: "Vaccination completed!",
      warning: emailWarning
    });

  } catch (err) {
    console.error("Error in /vaccination/complete:", err);
    res.status(500).json({ success: false, message: "Error marking vaccination complete" });
  }
});

/* UPDATE EFFECTS */
app.put("/vaccination/effects/:childID/:vaccineName/:doseNumber", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber } = req.params;
    const { effects } = req.body;
    const decodedName = decodeURIComponent(vaccineName);
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    const record = parent.vaccinationHistory.find(v => v.vaccineName === decodedName && Number(v.doseNumber) === Number(doseNumber));
    if (record) {
      record.postVaccineEffects = effects || "";
      await parent.save();
      return res.json({ message: "Post-vaccine effects updated" });
    }
    res.status(404).json({ message: "Vaccination record not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating post-vaccine effects" });
  }
});

/* GET VERIFY DIGITAL CERTIFICATE */
app.get("/api/verify/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const parent = await Parent.findOne({ "vaccinationHistory.certificateId": id });
    if (!parent) return res.status(404).json({ message: "Invalid Certificate" });

    const vaccineRecord = parent.vaccinationHistory.find(v => v.certificateId === id);
    if (!vaccineRecord) return res.status(404).json({ message: "Invalid Certificate" });

    res.json({
      verified: true,
      childName: parent.childName,
      parentName: parent.parentName,
      vaccineName: vaccineRecord.vaccineName,
      date: vaccineRecord.dateTaken,
      hospital: vaccineRecord.hospital,
      vaccinator: vaccineRecord.vaccinatorName || "Authorized Vaccinator",
      certificateId: vaccineRecord.certificateId,
      issuedAt: vaccineRecord.issuedAt,
      qrCode: vaccineRecord.qrCode
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error verifying certificate" });
  }
});

/* UNMARK COMPLETED */
app.put("/vaccination/uncomplete/:childID/:vaccineName/:doseNumber", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber } = req.params;
    const decodedName = decodeURIComponent(vaccineName);
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    let record = parent.vaccinationHistory.find(v => v.vaccineName === decodedName && Number(v.doseNumber) === Number(doseNumber));
    if (record) {
      record.status = "scheduled"; // Or recalculate based on date? Usually scheduled if undone.
      record.dateTaken = null;
    }

    await parent.save();
    res.json({ message: "Vaccination status reverted" });
  } catch (err) {
    res.status(500).json({ message: "Error reverting vaccination status" });
  }
});

/* RESCHEDULE */
app.put("/vaccination/reschedule/:childID/:vaccineName/:doseNumber", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber } = req.params;
    const { newDate } = req.body || {};
    const decodedName = decodeURIComponent(vaccineName);
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    const record = upsertVaccinationRecord(parent, decodedName, doseNumber, {});
    record.scheduledDate = new Date(newDate);
    record.status = "scheduled";
    record.dateTaken = null;

    await parent.save();
    res.json({ message: "Vaccination rescheduled" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error rescheduling vaccination" });
  }
});

/* VACCINATOR MONTHLY UPCOMING API */
app.get("/vaccinator/monthly", async (req, res) => {
  try {
    const centerId = req.query.centerId || null;
    const parents = await Parent.find();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Collect all eligible vaccination records
    const allRecords = [];

    parents.forEach(p => {
      const schedule = generateSchedule(p.childDOB);
      const merged = mergeHistory(schedule, p.vaccinationHistory);

      merged.forEach(v => {
        // Skip already completed vaccines
        if (v.status === "completed") return;

        const rawDate = v.scheduledDate || v.dueDate;
        if (!rawDate) return;

        const dueDate = new Date(rawDate);
        dueDate.setHours(0, 0, 0, 0);

        const daysDiff = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

        let sessionStatus = null;

        if (daysDiff === 0) {
          sessionStatus = "Today";
        } else if (daysDiff > 0 && daysDiff <= 5) {
          sessionStatus = "Upcoming";
        } else if (daysDiff < 0 && Math.abs(daysDiff) <= 30) {
          sessionStatus = "Overdue";
        } else {
          // daysDiff > 5 (too far future) OR overdue > 30 days (Lost to Follow-Up) — exclude
          return;
        }

        allRecords.push({
          childName: p.childName,
          childID: p.childID,
          vaccineName: v.vaccineName,
          doseNumber: v.doseNumber,
          date: dueDate.toDateString(),
          dueDate: dueDate,
          daysDiff,
          sessionStatus
        });
      });
    });

    // Sort: Today first → Upcoming (nearest first) → Recent Overdue (least overdue first)
    const sortOrder = { "Today": 0, "Upcoming": 1, "Overdue": 2 };
    allRecords.sort((a, b) => {
      const orderDiff = sortOrder[a.sessionStatus] - sortOrder[b.sessionStatus];
      if (orderDiff !== 0) return orderDiff;
      return a.daysDiff - b.daysDiff; // within same group, nearest first
    });

    // Group by month-year for card display
    const monthlyData = {};
    allRecords.forEach(record => {
      const monthYear = record.dueDate.toLocaleString("default", { month: "long", year: "numeric" });
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { month: monthYear, count: 0, children: [] };
      }
      monthlyData[monthYear].count++;
      monthlyData[monthYear].children.push({
        childName: record.childName,
        childID: record.childID,
        vaccineName: record.vaccineName,
        doseNumber: record.doseNumber,
        date: record.date,
        sessionStatus: record.sessionStatus,
        daysDiff: record.daysDiff
      });
    });

    // Sort month groups: earliest month first
    const sorted = Object.values(monthlyData).sort((a, b) => {
      const da = new Date(a.children[0]?.date || 0);
      const db = new Date(b.children[0]?.date || 0);
      return da - db;
    });

    res.json(sorted);
  } catch (err) {
    console.error("Error in /vaccinator/monthly:", err);
    res.status(500).json({ message: "Error fetching session data" });
  }
});

/* VACCINATOR FOLLOW-UP API */
app.get("/vaccinator/followup", async (req, res) => {
  try {
    const parents = await Parent.find();
    let followupList = [];
    parents.forEach(p => {
      const schedule = generateSchedule(p.childDOB);
      const merged = mergeHistory(schedule, p.vaccinationHistory);
      merged.forEach(v => {
        if (v.status === "overdue") {
          const takenDates = p.vaccinationHistory.filter(h => h.dateTaken).map(h => new Date(h.dateTaken));
          const lastVisitDate = takenDates.length > 0 ? new Date(Math.max(...takenDates)).toDateString() : "No visits";
          followupList.push({
            childName: p.childName,
            childID: p.childID,
            age: v.age,
            parentEmail: p.email,
            parentPhone: p.phone,
            vaccineName: v.vaccineName,
            doseNumber: v.doseNumber,
            dueDate: v.dueDate.toDateString(),
            lastVisitDate: lastVisitDate,
            hospitalName: v.hospital || p.hospital || "",
            centerId: v.centerId || "",
            status: "Overdue"
          });
        }
      });
    });
    res.json(followupList);
  } catch (err) {
    res.status(500).json({ message: "Error fetching followup data" });
  }
});

/* GET SCHEDULE CHILDREN */
app.get("/vaccinator/schedule_children", async (req, res) => {
  try {
    const parents = await Parent.find();
    const children = parents.map(p => {
      const completed = p.vaccinationHistory
        .filter(v => v.status === "completed" || v.dateTaken)
        .map(v => v.vaccineName);
      return {
        id: p.childID,
        name: p.childName,
        dob: p.childDOB,
        completedVaccines: completed
      };
    });
    res.json(children);
  } catch (err) {
    res.status(500).json({ message: "Error fetching schedule children" });
  }
});

/* SEND REMINDER API */
// (removed duplicate /vaccinator/send-reminder implementation)

/* ================= QR + OTP CHILD ACCESS (VACCINATOR) — register BEFORE listen in source order ================= */
app.post("/generate-qr-token", async (req, res) => {
  try {
    const { childID, origin } = req.body || {};
    if (!childID) return res.status(400).json({ message: "childID is required" });
    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });
    const secret = await ensureQrSecret(parent);
    const base =
      String(origin || "").trim() ||
      process.env.PUBLIC_BASE_URL ||
      process.env.FRONTEND_URL ||
      "https://vaccilink-final.onrender.com";
    const verify_url = buildVerifyQrUrl(base, childID, secret);
    res.json({
      token: secret,
      verify_url,
      childID,
      expiresInSec: null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error generating token" });
  }
});

app.post("/verify-child-access", async (req, res) => {
  try {
    const { childID, token, vaccinatorID } = req.body || {};
    if (!vaccinatorID) return res.status(400).json({ message: "vaccinatorID is required" });

    let resolvedChildID = childID ? String(childID).trim() : null;
    let tokenValid = false;

    if (token) {
      const rec = qrTokenStore[token];
      if (rec && rec.exp >= Date.now()) {
        resolvedChildID = rec.childID;
        tokenValid = true;
      } else {
        const bySecret = await Parent.findOne({ qrSecret: token });
        if (bySecret) {
          if (resolvedChildID && String(resolvedChildID) !== String(bySecret.childID)) {
            return res.status(400).json({ message: "QR data mismatch" });
          }
          resolvedChildID = bySecret.childID;
          tokenValid = true;
        }
      }
      if (!tokenValid) {
        return res.status(400).json({ message: "Invalid or expired QR token" });
      }
    }

    if (!resolvedChildID) {
      return res.status(400).json({ message: "childID or token is required" });
    }

    const vaccinator = await Vaccinator.findOne({ vaccinatorID });
    if (!vaccinator) return res.status(404).json({ message: "Vaccinator not found" });

    const parent = await Parent.findOne({ childID: resolvedChildID });
    if (!parent) return res.status(404).json({ message: "Child not found" });
    if (!parent.email) return res.status(400).json({ message: "Parent email not on file" });

    const otp = Math.floor(100000 + Math.random() * 900000);
    const key = `${resolvedChildID}:${vaccinatorID}`;
    vaccinatorAccessOtpStore[key] = { otp, exp: Date.now() + 10 * 60 * 1000 };

    await transporter.sendMail({
      from: "hospitrack58@gmail.com",
      to: parent.email,
      subject: "VacciLink — verify vaccinator access",
      text: `Your OTP for vaccinator access to ${parent.childName}'s record is: ${otp}\nValid for 10 minutes.`
    });

    res.json({ message: "OTP sent to parent email", childID: resolvedChildID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error requesting access" });
  }
});

app.post("/verify-otp-access", async (req, res) => {
  try {
    const { childID, otp, vaccinatorID } = req.body || {};
    if (!childID || !otp || !vaccinatorID) {
      return res.status(400).json({ access: false, message: "childID, otp, and vaccinatorID are required" });
    }
    const key = `${childID}:${vaccinatorID}`;
    const rec = vaccinatorAccessOtpStore[key];
    if (!rec || rec.exp < Date.now() || String(rec.otp) !== String(otp)) {
      return res.status(400).json({ access: false, message: "Invalid or expired OTP" });
    }
    delete vaccinatorAccessOtpStore[key];

    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ access: false, message: "Child not found" });

    const schedule = generateSchedule(parent.childDOB);
    const merged = mergeHistory(schedule, parent.vaccinationHistory);

    res.json({
      access: true,
      childData: {
        childName: parent.childName,
        childID: parent.childID,
        parentName: parent.parentName,
        parentPhone: parent.phone,
        vaccinationHistory: merged
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ access: false, message: "Verification error" });
  }
});

app.put("/vaccinator/update-vaccination", async (req, res) => {
  try {
    const { childID, vaccineName, doseNumber, dateTaken, status, hospital, centerId, vaccinatorID } = req.body || {};
    if (!childID || !vaccineName || doseNumber == null || !vaccinatorID) {
      return res.status(400).json({ message: "childID, vaccineName, doseNumber, vaccinatorID are required" });
    }
    const vaccinator = await Vaccinator.findOne({ vaccinatorID });
    if (!vaccinator) return res.status(403).json({ message: "Invalid vaccinator" });

    const parent = await Parent.findOne({ childID });
    if (!parent) return res.status(404).json({ message: "Child not found" });

    const record = upsertVaccinationRecord(parent, vaccineName, doseNumber, {});
    if (dateTaken !== undefined && dateTaken !== null && dateTaken !== "") {
      record.dateTaken = new Date(dateTaken);
    }
    if (status) record.status = status;
    if (hospital !== undefined) record.hospital = hospital;
    if (centerId !== undefined) record.centerId = centerId;
    record.updatedByVaccinator = true;
    record.vaccinatorID = vaccinatorID;
    record.updatedAt = new Date();

    await parent.save();
    res.json({ message: "Vaccination updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating vaccination" });
  }
});

/* ================= AUTOMATED EMAIL REMINDERS ================= */

async function checkUpcomingVaccines() {
  console.log("🕒 Running daily vaccination reminder check at 9:30 AM...");
  try {
    const parents = await Parent.find({});

    let remindersSent = 0;

    for (const parent of parents) {
      // Must have valid email and child DOB to calculate schedule
      if (!parent.email || !parent.childDOB) continue;

      console.log(`Checking parent: ${parent.email}`);

      if (!parent.childID) {
        console.log(`Child ID not found for parent ${parent.email}, skipping.`);
        continue;
      }

      console.log(`Child found: ${parent.childName} (ID: ${parent.childID})`);

      const schedule = generateSchedule(parent.childDOB);
      // Merging schedule to figure out upcoming statuses accurately
      const mergedHistory = mergeHistory(schedule, parent.vaccinationHistory);

      console.log(`Vaccines count for ${parent.childName}: ${mergedHistory.length}`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let parentModified = false;

      for (const vaccine of mergedHistory) {
        // Skip completed vaccines
        if (vaccine.status === "completed") continue;

        let dueDate = vaccine.scheduledDate || vaccine.dueDate;
        if (!dueDate) continue;

        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);

        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Reminder for exactly 3, 2, 1, or 0 days
        if ([3, 2, 1, 0].includes(diffDays)) {
          // Look up actual record to check if reminder was already sent today
          const actualRecord = parent.vaccinationHistory.find(v => v.vaccineName === vaccine.vaccineName && Number(v.doseNumber) === Number(vaccine.doseNumber));

          let lastSent = actualRecord ? actualRecord.lastReminderSent : null;

          if (lastSent) {
            lastSent = new Date(lastSent);
            lastSent.setHours(0, 0, 0, 0);
            if (lastSent.getTime() === today.getTime()) {
              // Already sent a reminder for this vaccine today
              console.log(`⏭️ Reminder already sent today for ${vaccine.vaccineName} to ${parent.email}, skipping.`);
              continue; // Do not break out of loop, process other vaccines
            }
          }

          // Trigger email logic
          let daysText = diffDays === 0 ? "Today" : `${diffDays} Day(s)`;
          let reminderIntro = diffDays === 0
            ? "Vaccination is due <strong style=\"color: #e53935;\">TODAY</strong>. Please book immediately."
            : "This is a friendly reminder that a vaccination is coming up soon for your child.";

          const htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; font-size: 14px;">
              <p>Dear ${parent.parentName},</p>
              <p>${reminderIntro}</p>
              
              <p style="color: #2e7d32; font-weight: bold; font-size: 16px; margin-bottom: 5px;">Reminder Details:</p>
              <table style="font-family: Arial, sans-serif; font-size: 14px; border: none; margin-bottom:10px;">
                <tr><td style="width: 120px;">Child Name</td><td>: <strong>${parent.childName}</strong></td></tr>
                <tr><td>Vaccine</td><td>: <strong>${vaccine.vaccineName} (Dose ${vaccine.doseNumber})</strong></td></tr>
                <tr><td>Due Date</td><td>: ${due.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
                <tr><td>Days Remaining</td><td>: <strong style="color: #e53935;">${daysText}</strong></td></tr>
              </table>

              <p style="margin-top: 20px; color:#333;">Please ensure you book an appointment or visit the nearest vaccination center timely to keep your child protected.</p>
              
              <p style="margin-top: 20px; color:#333;">
                <strong>Regards,</strong><br>
                <span style="color: #2e7d32; font-weight: bold;">Vaccilink Team</span>
              </p>
              
              <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
              <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply.</p>
            </div>
          `;

          try {
            await transporter.sendMail({
              from: process.env.EMAIL_USER || "hospitrack58@gmail.com",
              to: parent.email,
              subject: "Vaccination Reminder - VacciLink",
              html: htmlContent
            });
            console.log(`✅ Reminder sent to ${parent.email} for ${vaccine.vaccineName} (${diffDays} days left)`);
            remindersSent++;

            // Upsert the record (adds to parent if missing or updates)
            const patchRecord = upsertVaccinationRecord(parent, vaccine.vaccineName, vaccine.doseNumber, {});
            patchRecord.lastReminderSent = new Date();
            parentModified = true;

          } catch (mailErr) {
            console.error(`❌ Failed to send reminder email to ${parent.email} for ${vaccine.vaccineName}:`, mailErr);
          }
        }
      }

      // Save changes if record was patched
      if (parentModified) {
        await parent.save();
      }
    }

    if (remindersSent === 0) {
      console.log("ℹ️ No upcoming vaccinations found needing reminders today.");
    } else {
      console.log(`✅ Reminder job completed. Sent ${remindersSent} reminders.`);
    }

  } catch (err) {
    console.error("❌ Error in checkUpcomingVaccines cron job:", err);
  }
}

// Temporary test endpoint to trigger emails immediately
app.get("/test-reminders", async (req, res) => {
  await checkUpcomingVaccines();
  res.send("Reminder check triggered manually. Check terminal logs.");
});

// Schedule the cron job to run daily at 9:30 AM server time
cron.schedule("20 13 * * *", () => {
  checkUpcomingVaccines();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


const bcrypt = require("bcrypt");

/* ================= VACCINATOR SCHEMA ================= */

const vaccinatorSchema = new mongoose.Schema({
  fullName: String,
  email: String,
  phone: String,
  password: String,
  vaccinatorID: String,
  designation: String,
  centerId: String
});

const Vaccinator = mongoose.model("Vaccinator", vaccinatorSchema);

/* ================= REGISTER ================= */

app.post("/vaccinator/register", async (req, res) => {
  try {

    const { fullName, email, phone, password, vaccinatorID, designation, centerId } = req.body;

    const existing = await Vaccinator.findOne({ email });

    if (existing) {
      return res.json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newVaccinator = new Vaccinator({
      fullName,
      email,
      phone,
      password: hashedPassword,
      vaccinatorID,
      designation,
      centerId
    });

    await newVaccinator.save();

    res.json({ message: "Registered successfully!" });

  } catch (err) {
    console.log(err);
    res.json({ message: "Error in registration" });
  }
});

/* ================= VACCINATOR LOGIN ================= */

app.post("/vaccinator/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("LOGIN ATTEMPT:", email);

    const vaccinator = await Vaccinator.findOne({ email });
    console.log("FOUND USER:", vaccinator);

    if (!vaccinator) {
      return res.json({ message: "User not found ❌" });
    }

    const isMatch = await bcrypt.compare(password, vaccinator.password);
    console.log("PASSWORD MATCH:", isMatch);

    if (!isMatch) {
      return res.json({ message: "Wrong password ❌" });
    }

    const center = vaccinator.centerId ? await Center.findOne({ centerId: vaccinator.centerId }) : null;

    res.json({
      message: "Login successful",
      vaccinator: {
        fullName: vaccinator.fullName,
        email: vaccinator.email,
        centerId: vaccinator.centerId,
        centerName: center ? center.name : (vaccinator.centerName || ""),
        centerAddress: center ? center.address : "",
        vaccinatorID: vaccinator.vaccinatorID || ""
      }
    });

  } catch (err) {
    console.log(err);
    res.json({ message: "Error logging in" });
  }
});

/* ================= VACCINATOR PROFILE (DYNAMIC) ================= */
app.get("/vaccinator/profile/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const vaccinator = await Vaccinator.findOne({ email });
    if (!vaccinator) return res.status(404).json({ message: "Vaccinator not found" });

    const center = vaccinator.centerId ? await Center.findOne({ centerId: vaccinator.centerId }) : null;

    res.json({
      fullName: vaccinator.fullName || "",
      email: vaccinator.email || "",
      phone: vaccinator.phone || "",
      vaccinatorID: vaccinator.vaccinatorID || "",
      designation: vaccinator.designation || "",
      centerId: vaccinator.centerId || "",
      centerName: center?.name || vaccinator.centerName || "",
      centerAddress: center?.address || "",
      centerCity: center?.city || ""
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching vaccinator profile" });
  }
});

/* GET VACCINATOR DETAILS (Simplified for Header) */
app.get("/vaccinator/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const vaccinator = await Vaccinator.findOne({ email });
    if (!vaccinator) return res.status(404).json({ message: "Vaccinator not found" });

    const center = vaccinator.centerId ? await Center.findOne({ centerId: vaccinator.centerId }) : null;

    res.json({
      fullName: vaccinator.fullName || "",
      centerName: center?.name || vaccinator.centerName || "N/A",
      centerCity: center?.city || "",
      designation: vaccinator.designation || "Vaccinator"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching vaccinator details" });
  }
});

/* ================= VACCINATOR SUMMARY (DYNAMIC) ================= */
app.get("/vaccinator/summary/:centerId", async (req, res) => {
  try {
    const { centerId } = req.params;
    const completed = await Appointment.find({ centerId, status: "completed" }).sort({ appointmentDate: -1 });
    const totalSessionsConducted = completed.length;
    const totalChildrenVaccinated = new Set(completed.map(a => a.childID).filter(Boolean)).size;
    const lastSessionDate = completed.length ? completed[0].appointmentDate : null;

    res.json({
      totalSessionsConducted,
      totalChildrenVaccinated,
      lastSessionDate
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching vaccinator summary" });
  }
});

/* ================= LAST 5 VACCINATION SESSIONS ================= */
app.get("/vaccinator/recent-sessions/:centerId", async (req, res) => {
  try {
    const { centerId } = req.params;
    const items = await Appointment.find({ centerId, status: "completed" })
      .sort({ appointmentDate: -1 })
      .limit(5);

    res.json(items.map(a => ({
      childName: a.childName || "",
      vaccineName: a.vaccineName || "",
      date: a.appointmentDate || null
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching recent sessions" });
  }
});

/* ================= ANALYTICS APIS ================= */

/**
 * GET /api/analytics/appointment-type
 * Returns count of online vs onsite appointments from Appointment collection.
 * Uses the `type` field (values: "online" | "onsite").
 */
app.get("/api/analytics/appointment-type", async (req, res) => {
  try {
    const { centerId } = req.query;
    const matchQuery = {};
    if (centerId) matchQuery.centerId = centerId;

    const results = await Appointment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $toLower: { $ifNull: ["$type", "online"] } },
          count: { $sum: 1 }
        }
      }
    ]);

    let online = 0;
    let onsite = 0;
    results.forEach(r => {
      if (r._id === "online") online = r.count;
      else if (r._id === "onsite") onsite = r.count;
    });

    res.json({ online, onsite, total: online + onsite });
  } catch (err) {
    console.error("Analytics appointment-type error:", err);
    res.status(500).json({ message: "Error fetching appointment type data" });
  }
});

/**
 * GET /api/analytics/status
 * Returns vaccination status counts across all Parent.vaccinationHistory records:
 *   vaccinated → status === "completed" or dateTaken exists
 *   overdue    → status === "overdue" and not completed
 *   missed     → status === "missed" and not completed
 *   lost       → no visit in last 90 days and not completed (lost to follow-up)
 */
app.get("/api/analytics/status", async (req, res) => {
  try {
    const { centerId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lostThreshold = new Date(today);
    lostThreshold.setDate(lostThreshold.getDate() - 90);

    // Filter by centerId if provided
    const matchQuery = {};
    if (centerId) {
      // We look for parents who have at least one record for this center,
      // or we filter the history items later.
      // Better approach: aggregate to filter history items accurately.
      const parents = await Parent.find({
        $or: [
          { "vaccinationHistory.centerId": centerId },
          { hospital: centerId } // Fallback
        ]
      }, { vaccinationHistory: 1, _id: 0 });

      let vaccinated = 0;
      let overdue = 0;
      let missed = 0;
      let lost = 0;

      parents.forEach(p => {
        (p.vaccinationHistory || []).forEach(v => {
          // If filtering by centerId, only count records matching it
          if (centerId && v.centerId !== centerId) return;

          const isCompleted = v.status === "completed" || !!v.dateTaken;
          if (isCompleted) {
            vaccinated++;
            return;
          }
          if (v.status === "missed") {
            missed++;
            return;
          }
          if (v.visitDate && new Date(v.visitDate) < lostThreshold) {
            lost++;
            return;
          }
          const dueDate = v.scheduledDate || v.dueDate;
          if (dueDate && new Date(dueDate) < today) {
            overdue++;
          }
        });
      });
      return res.json({ vaccinated, overdue, missed, lost });
    }

    // fallback if no centerId
    const parents = await Parent.find({}, { vaccinationHistory: 1, _id: 0 });
    let vaccinated = 0, overdue = 0, missed = 0, lost = 0;
    parents.forEach(p => {
      (p.vaccinationHistory || []).forEach(v => {
        const isCompleted = v.status === "completed" || !!v.dateTaken;
        if (isCompleted) vaccinated++;
        else if (v.status === "missed") missed++;
        else if (v.visitDate && new Date(v.visitDate) < lostThreshold) lost++;
        else {
          const dueDate = v.scheduledDate || v.dueDate;
          if (dueDate && new Date(dueDate) < today) overdue++;
        }
      });
    });
    res.json({ vaccinated, overdue, missed, lost });

  } catch (err) {
    console.error("Analytics status error:", err);
    res.status(500).json({ message: "Error fetching vaccination status data" });
  }
});

/**
 * GET /api/analytics/trend
 * Returns vaccination completions grouped by date (YYYY-MM-DD) sorted ascending.
 * Uses Parent.vaccinationHistory.dateTaken for completed records.
 */
app.get("/api/analytics/trend", async (req, res) => {
  try {
    const { centerId } = req.query;
    const pipeline = [
      { $unwind: "$vaccinationHistory" }
    ];

    const matchStage = {
      "vaccinationHistory.dateTaken": { $exists: true, $ne: null },
      "vaccinationHistory.status": "completed"
    };

    if (centerId) {
      matchStage["vaccinationHistory.centerId"] = centerId;
    }

    pipeline.push({ $match: matchStage });

    pipeline.push(
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$vaccinationHistory.dateTaken"
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          count: 1
        }
      },
      { $sort: { date: 1 } },
      { $limit: 60 }
    );

    const results = await Parent.aggregate(pipeline);
    res.json(results);
  } catch (err) {
    console.error("Analytics trend error:", err);
    res.status(500).json({ message: "Error fetching vaccination trend data" });
  }
});

/* ================= AI CHATBOT ================= */

const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let geminiModel = null;

if (GEMINI_API_KEY && GEMINI_API_KEY !== "your_gemini_api_key_here") {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  console.log("✅ Gemini AI model initialized for chatbot");
} else {
  console.warn("⚠️  GEMINI_API_KEY not set — chatbot general questions will use fallback responses");
}

/**
 * Classify whether a user message is asking about their child's records
 * or a general vaccination question.
 */
function classifyChatMessage(message) {
  const childKeywords = [
    "my child", "my kid", "my baby", "my son", "my daughter",
    "pending", "completed", "overdue", "due next", "next vaccine",
    "next vaccination", "vaccination history", "vaccine history",
    "which vaccines", "what vaccines", "how many vaccines",
    "when is", "when's", "schedule for my", "records",
    "upcoming vaccines", "missed vaccines"
  ];
  const lowerMsg = message.toLowerCase();
  return childKeywords.some(kw => lowerMsg.includes(kw));
}

/**
 * Build a natural-language answer from the child's real vaccination data.
 */
function buildChildDataResponse(message, parent, merged) {
  const lowerMsg = message.toLowerCase();
  const childName = parent.childName || "your child";

  const completed = merged.filter(v => v.status === "completed");
  const pending = merged.filter(v => v.status === "upcoming" || v.status === "scheduled");
  const overdue = merged.filter(v => v.status === "overdue");

  // Sort pending by date
  const pendingSorted = [...pending].sort((a, b) => {
    const da = new Date(a.scheduledDate || a.dueDate || 0);
    const db = new Date(b.scheduledDate || b.dueDate || 0);
    return da - db;
  });

  // What vaccines are pending?
  if (lowerMsg.includes("pending") || (lowerMsg.includes("upcoming") && lowerMsg.includes("vaccine"))) {
    if (pendingSorted.length === 0) {
      return `Great news! ${childName} has no pending vaccines. All vaccinations are up to date! 🎉`;
    }
    let response = `📋 **Pending vaccines for ${childName}:**\n\n`;
    pendingSorted.forEach((v, i) => {
      const dueDate = v.scheduledDate || v.dueDate;
      const dateStr = dueDate ? new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Date not set";
      response += `${i + 1}. **${v.vaccineName}** (Dose ${v.doseNumber}) — Due: ${dateStr}\n`;
    });
    response += `\nTotal: ${pendingSorted.length} vaccine(s) pending.`;
    return response;
  }

  // Next vaccination
  if (lowerMsg.includes("next vaccine") || lowerMsg.includes("next vaccination") || lowerMsg.includes("due next")) {
    if (pendingSorted.length === 0) {
      return `${childName} has no upcoming vaccines. All vaccinations are complete! ✅`;
    }
    const next = pendingSorted[0];
    const dueDate = next.scheduledDate || next.dueDate;
    const dateStr = dueDate ? new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Date not set";
    return `💉 **Next vaccine for ${childName}:**\n\n**${next.vaccineName}** (Dose ${next.doseNumber})\n📅 Scheduled: ${dateStr}\n\nPlease book an appointment if you haven't already!`;
  }

  // Vaccination history / completed vaccines
  if (lowerMsg.includes("history") || lowerMsg.includes("completed") || lowerMsg.includes("taken")) {
    if (completed.length === 0) {
      return `${childName} hasn't received any vaccinations yet according to our records.`;
    }
    let response = `✅ **Completed vaccines for ${childName}:**\n\n`;
    completed.forEach((v, i) => {
      const dateStr = v.dateTaken ? new Date(v.dateTaken).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Date not recorded";
      response += `${i + 1}. **${v.vaccineName}** (Dose ${v.doseNumber}) — ${dateStr}\n`;
    });
    response += `\nTotal: ${completed.length} vaccine(s) completed.`;
    return response;
  }

  // Overdue / missed vaccines
  if (lowerMsg.includes("overdue") || lowerMsg.includes("missed") || lowerMsg.includes("late")) {
    if (overdue.length === 0) {
      return `${childName} has no overdue vaccines. Everything is on track! 👍`;
    }
    let response = `⚠️ **Overdue vaccines for ${childName}:**\n\n`;
    overdue.forEach((v, i) => {
      const dueDate = v.dueDate;
      const dateStr = dueDate ? new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Date not set";
      response += `${i + 1}. **${v.vaccineName}** (Dose ${v.doseNumber}) — Was due: ${dateStr}\n`;
    });
    response += `\n⚠️ Please consult your doctor and book these vaccinations as soon as possible.`;
    return response;
  }

  // General summary about the child
  let response = `📊 **Vaccination summary for ${childName}:**\n\n`;
  response += `✅ Completed: ${completed.length}\n`;
  response += `📋 Pending: ${pending.length}\n`;
  response += `⚠️ Overdue: ${overdue.length}\n`;
  response += `📝 Total vaccines in schedule: ${merged.length}\n`;
  if (pendingSorted.length > 0) {
    const next = pendingSorted[0];
    const dueDate = next.scheduledDate || next.dueDate;
    const dateStr = dueDate ? new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Soon";
    response += `\n💉 Next up: **${next.vaccineName}** (Dose ${next.doseNumber}) — ${dateStr}`;
  }
  return response;
}

const CHATBOT_SYSTEM_PROMPT = `You are VacciLink AI Assistant. Help parents understand vaccinations and child healthcare records. Use database information for child-specific questions. Never invent medical records, vaccine schedules, due dates, or vaccination history. Keep responses simple, accurate, and professional. Use simple language a parent can understand. If you don't know something, say so honestly. Always recommend consulting a doctor for medical decisions. Keep responses concise (under 200 words). Format important terms in **bold**.`;

app.post("/api/chatbot", async (req, res) => {
  try {
    const { message, email } = req.body;

    if (!message || !email) {
      return res.status(400).json({ reply: "Please provide a message and your login email." });
    }

    const isChildQuestion = classifyChatMessage(message);

    if (isChildQuestion) {
      // Fetch parent and child data from MongoDB
      const parent = await Parent.findOne({
        $or: [{ email }, { phone: email }]
      });

      if (!parent) {
        return res.json({ reply: "I couldn't find your account. Please make sure you're logged in." });
      }

      if (!parent.childID) {
        return res.json({ reply: "No child profile is linked to your account yet. Please complete your child's registration first." });
      }

      // Generate schedule and merge with history
      const schedule = generateSchedule(parent.childDOB);
      const merged = mergeHistory(schedule, parent.vaccinationHistory);

      const reply = buildChildDataResponse(message, parent, merged);
      return res.json({ reply, source: "database" });
    }

    // General vaccination question — use Gemini AI
    if (geminiModel) {
      try {
        const chat = geminiModel.startChat({
          history: [],
          generationConfig: { maxOutputTokens: 500 }
        });
        const result = await chat.sendMessage(
          CHATBOT_SYSTEM_PROMPT + "\n\nParent's question: " + message
        );
        const aiReply = result.response.text();
        return res.json({ reply: aiReply, source: "ai" });
      } catch (aiErr) {
        console.error("Gemini AI error:", aiErr.message);
        return res.json({
          reply: "I'm having trouble connecting to the AI service right now. Please try again in a moment, or ask about your child's vaccine records which I can look up directly!",
          source: "fallback"
        });
      }
    } else {
      // Fallback responses when Gemini is not configured
      const fallbackResponses = {
        "mmr": "**MMR Vaccine** protects against Measles, Mumps, and Rubella. It's typically given in two doses — the first at 9 months and the second at 16 months. Side effects may include mild fever and rash. Consult your pediatrician for more details.",
        "side effect": "Common vaccine side effects include mild fever, redness or swelling at the injection site, and fussiness. These usually resolve within 1-2 days. Contact your doctor if symptoms persist or worsen.",
        "important": "Vaccinations are crucial because they protect your child from serious diseases like Polio, Measles, Hepatitis, and Tuberculosis. They also help build herd immunity to protect the community.",
        "birth": "Vaccines given at birth include **BCG** (Tuberculosis), **OPV-0** (Polio), **Hepatitis-B** (first dose), and **Vitamin K**. These provide essential early protection for your newborn."
      };

      const lowerMsg = message.toLowerCase();
      for (const [key, response] of Object.entries(fallbackResponses)) {
        if (lowerMsg.includes(key)) {
          return res.json({ reply: response, source: "fallback" });
        }
      }

      return res.json({
        reply: "I can help you with vaccination information! Try asking:\n\n• What is the MMR vaccine?\n• What are common vaccine side effects?\n• Why are vaccinations important?\n• What vaccines are given at birth?\n\nOr ask about **your child's records** like:\n• What vaccines are pending for my child?\n• When is my child's next vaccination?",
        source: "fallback"
      });
    }
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ reply: "Something went wrong. Please try again later." });
  }
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`🚀 VacciLink Server running at http://localhost:${PORT}`);
  console.log(`📊 Connected to MongoDB: ${MONGO_URI}`);
});