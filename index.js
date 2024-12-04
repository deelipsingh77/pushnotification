require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

// Ensure Firebase Admin is initialized correctly
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url:
        process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    }),
  });
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Register device token
app.post("/register-device", async (req, res) => {
  try {
    const { userId, deviceToken } = req.body;

    if (!userId || !deviceToken) {
      return res
        .status(400)
        .json({ error: "User ID and Device Token are required" });
    }

    // Validate input
    const sanitizedUserId = userId.toString().trim();
    const sanitizedDeviceToken = deviceToken.toString().trim();

    // Check if the device token already exists
    const deviceDoc = await db.collection("devices").doc(sanitizedUserId).get();
    if (deviceDoc.exists && deviceDoc.data().token === sanitizedDeviceToken) {
      return res.status(200).json({
        message: "Device is already registered",
        userId: sanitizedUserId,
      });
    }

    // Use set with merge to avoid overwriting existing data
    await db.collection("devices").doc(sanitizedUserId).set(
      {
        token: sanitizedDeviceToken,
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`Device registered for user: ${sanitizedUserId}`);

    res.status(200).json({
      message: "Device registered successfully",
      userId: sanitizedUserId,
    });
  } catch (error) {
    console.error("Detailed Error Registering Device:", error);
    res.status(500).json({
      error: "Failed to register device",
      details: error.message,
    });
  }
});

// Get all registered devices
app.get("/devices", async (req, res) => {
  try {
    const devicesSnapshot = await db.collection("devices").get();
    const devices = devicesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(devices);
  } catch (error) {
    console.error("Error fetching devices:", error);
    res.status(500).json({
      error: "Failed to fetch devices",
      details: error.message,
    });
  }
});

// Send notification to a specific device
app.post("/send-notification", async (req, res) => {
  try {
    const { targetUserId, title, body } = req.body;
    console.log("targetUserId:", req.body);

    // Fetch target device token
    const deviceDoc = await db.collection("devices").doc(targetUserId).get();
    console.log("deviceDoc:", deviceDoc.data());

    if (!deviceDoc.exists) {
      console.log("Device not found");

      return res.status(404).json({ error: "Device not found" });
    }

    const message = {
      token: deviceDoc.data().token,
      notification: {
        title: title || "Notification",
        body: body || "You have a new message",
      },
      android: { priority: "high" },
    };

    const response = await admin.messaging().send(message);

    console.log("Notification sent successfully:", response);

    res.status(200).json({
      message: "Notification sent successfully",
      response,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({
      error: "Failed to send notification",
      details: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    details: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
