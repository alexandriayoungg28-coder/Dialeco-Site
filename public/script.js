// script.js
import { firebaseConfig } from "./firebaseConfig.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.2.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.2.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.2.0/firebase-storage.js";
import { getDatabase, ref as dbRef, set, push } from "https://www.gstatic.com/firebasejs/10.2.0/firebase-database.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const database = getDatabase(app);

// DOM Elements
const playBtn = document.getElementById("playBtn");
const audioPlayer = document.getElementById("audioPlayer");
const audioTimestamp = document.getElementById("audioTimestamp");
const micIcon = document.getElementById("micIcon");

// Example: user name
const userName = "Student"; // can replace with dynamic login later

// Conversation audio sequence
const conversationAudios = [
  "https://firebasestorage.googleapis.com/v0/b/dialeco-d7b8f.firebasestorage.app/o/Conversation%20recording%20%231.m4a?alt=media&token=59e57eff-0b8f-4f51-9b06-88b50558cec2",
  "https://firebasestorage.googleapis.com/v0/b/dialeco-d7b8f.firebasestorage.app/o/Conversation%20recording%20%232.m4a?alt=media&token=3cc0ae5e-c2ed-41d5-81e2-097940304be3",
  "https://firebasestorage.googleapis.com/v0/b/dialeco-d7b8f.firebasestorage.app/o/Conversation%20recording%20%233.m4a?alt=media&token=97ec169e-6928-45dd-bbf9-b869a4cd0f8e",
  "https://firebasestorage.googleapis.com/v0/b/dialeco-d7b8f.firebasestorage.app/o/Conversation%20recording%20%234.m4a?alt=media&token=d4901282-7073-4849-98fe-a2f8f84620f3",
  "https://firebasestorage.googleapis.com/v0/b/dialeco-d7b8f.firebasestorage.app/o/Conversation%20recording%20%235.m4a?alt=media&token=639892f9-4935-4e75-afe4-8c2107682c5f",
  "https://firebasestorage.googleapis.com/v0/b/dialeco-d7b8f.firebasestorage.app/o/Conversation%20ender%20recording%20%236.m4a?alt=media&token=802fbf0d-3b9a-490e-8e02-d4176c2a9c11"
];

let currentAudioIndex = 0;
let mediaRecorder;
let audioChunks = [];

function waitForAuthenticatedUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for authenticated user"));
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, user => {
      clearTimeout(timeoutId);
      unsubscribe();
      resolve(user);
    }, error => {
      clearTimeout(timeoutId);
      unsubscribe();
      reject(error);
    });
  });
}

// Format seconds to mm:ss
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Update timestamp
audioPlayer.addEventListener("timeupdate", () => {
  audioTimestamp.textContent = formatTime(audioPlayer.currentTime);
});

audioPlayer.addEventListener("ended", () => {
  playBtn.textContent = "▶";
  audioTimestamp.textContent = formatTime(0);
  micIcon.classList.add("active"); // Enable mic after audio ends
});

audioPlayer.addEventListener("pause", () => {
  if (audioPlayer.currentTime !== 0) playBtn.textContent = "▶";
});

audioPlayer.addEventListener("loadedmetadata", () => {
  audioTimestamp.textContent = formatTime(0);
});

// Play/pause button
playBtn.addEventListener("click", () => {
  if (audioPlayer.paused) {
    audioPlayer.play();
    playBtn.textContent = "⏸";
  } else {
    audioPlayer.pause();
    playBtn.textContent = "▶";
  }
});

// Function to play the next audio in the sequence
function playNextAudio() {
  if (currentAudioIndex >= conversationAudios.length) return;

  audioPlayer.src = conversationAudios[currentAudioIndex];
  audioPlayer.play();
}

// Helper to create a persistent green message bubble that uses a Firebase URL
function createGreenMessageBubble(firebaseUrl, durationSeconds = 0) {
  const greenMessagesContainer = document.getElementById("greenMessagesContainer");
  const messageId = `green-${Date.now()}`;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const timestamp = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const wrapper = document.createElement("div");
  wrapper.className = "message sent";
  wrapper.id = messageId;
  wrapper.style.display = "flex";

  wrapper.innerHTML = `
    <div class="message-bubble">
      <button class="play-btn">▶</button>
      <div class="waveform">
        <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
        <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
      </div>
      <span class="timestamp">${timestamp}</span>
    </div>
  `;

  greenMessagesContainer.appendChild(wrapper);
  greenMessagesContainer.scrollTop = greenMessagesContainer.scrollHeight;

  // Attach audio element with persistence URL and duration/duration-fix
  const btn = wrapper.querySelector(".play-btn");
  const waveform = wrapper.querySelector(".waveform");

  const audio = new Audio(firebaseUrl);
  audio.preload = "auto";

  audio.addEventListener("loadedmetadata", () => {
    try { audio.currentTime = 1e101; } catch (e) {}
    try { audio.currentTime = 0; } catch (e) {}
  });

  let playing = false;
  audio.addEventListener("ended", () => {
    playing = false;
    btn.textContent = "▶";
    waveform.classList.remove("playing");
  });

  btn.addEventListener("click", () => {
    if (!playing) {
      playing = true;
      btn.textContent = "⏸";
      waveform.classList.add("playing");
      audio.play().catch(err => {
        console.error("Play failed:", err);
        playing = false;
        btn.textContent = "▶";
        waveform.classList.remove("playing");
      });
    } else {
      playing = false;
      btn.textContent = "▶";
      waveform.classList.remove("playing");
      try { audio.pause(); } catch (e) {}
    }
  });

  // allow waveform click to scrub (simple seek)
  waveform.addEventListener("click", (ev) => {
    const rect = waveform.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
      try { audio.currentTime = pct * audio.duration; } catch (e) {}
    }
  });

  try { audio.load(); } catch (e) {}
  return { id: messageId, audio };
}

// Mic recording for user reply
micIcon.addEventListener("click", async () => {
  console.log("Mic icon clicked");
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    console.log("Starting new recording...");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Microphone stream acquired");
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => {
      console.log("Data available event:", event?.data?.size, "bytes");
      if (event && event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      console.log("Recording stopped. Total chunks:", audioChunks.length);
      // Create a Blob from chunks
      const recordedBlob = new Blob(audioChunks, { type: audioChunks[0]?.type || "audio/mp4" });
      console.log("Blob created:", recordedBlob.size, "bytes, type:", recordedBlob.type);

      const user = await waitForAuthenticatedUser();
      console.log("User authenticated:", user?.email);
      if (!user || !user.email) {
        console.error("No authenticated user found");
        alert("Please sign in before recording so the audio can be saved to Firebase Storage.");
        return;
      }

      const userFolder = user.email.split("@").join("_");
      console.log("User folder:", userFolder);

      // Build filename for the authenticated user's Firebase Storage folder
      const storagePath = `user_recordings/${userFolder}/green_${Date.now()}.mp4`;
      const fileRef = storageRef(storage, storagePath);

      try {
        console.log("Starting upload to path:", storagePath);
        console.log("Blob size:", recordedBlob.size, "bytes");
        console.log("Blob type:", recordedBlob.type);
        
        // Upload bytes
        await uploadBytes(fileRef, recordedBlob, { contentType: "audio/mp4" });
        console.log("Upload successful!");
        
        // Get permanent download URL
        const downloadURL = await getDownloadURL(fileRef);
        console.log("Download URL:", downloadURL);

        // Store metadata in Realtime Database (optional)
        try {
          const audioDataRef = push(dbRef(database, "audioResponses"));
          await set(audioDataRef, {
            user: user.displayName || userName,
            userEmail: user.email,
            fileName: storagePath,
            url: downloadURL,
            timestamp: Date.now()
          });
        } catch (dbErr) {
          console.warn("Failed to save metadata to database:", dbErr);
        }

        // Create a green message bubble that references the Firebase URL (persistent)
        // Use recorded duration if available (best effort)
        let durationSeconds = 0;
        try {
          // attempt to get duration via temporary element
          const tmp = document.createElement("audio");
          tmp.src = downloadURL;
          tmp.preload = "metadata";
          tmp.addEventListener("loadedmetadata", () => {
            if (isFinite(tmp.duration) && tmp.duration > 0) {
              durationSeconds = Math.round(tmp.duration);
            }
          });
        } catch (e) {
          console.warn("Could not precompute duration:", e);
        }

        // Insert bubble immediately (duration may be updated later via loadedmetadata)
        createGreenMessageBubble(downloadURL, durationSeconds);

        // Move on to next conversation audio
        currentAudioIndex++;
        micIcon.classList.remove("active");
        playNextAudio();
      } catch (uploadErr) {
        console.error("Firebase upload failed:", uploadErr);
        console.error("Error code:", uploadErr.code);
        console.error("Error message:", uploadErr.message);
        console.error("Full error:", JSON.stringify(uploadErr));
        alert("Failed to upload recording. Please try again. Check console for details.");
      }
    });

    mediaRecorder.start();
    console.log("MediaRecorder started, recording...");
    micIcon.classList.add("recording");
  } else if (mediaRecorder.state === "recording") {
    console.log("Stopping recording...");
    mediaRecorder.stop();
    micIcon.classList.remove("recording");
  }
});

// Start first audio on page load
window.onload = () => {
  playNextAudio();
};
window.onload = function() {
  const messagesOrder = [
    'gray-1', 'green-1',
    'gray-2', 'green-2',
    'gray-3', 'green-3',
    'gray-4', 'green-4',
    'gray-5', 'green-5',
    'gray-6', 'green-6' // green-6 optional
  ];

  function popUpMessages(index = 0) {
    if (index >= messagesOrder.length) return;

    const msgId = messagesOrder[index];
    const msg = document.getElementById(msgId);

    if (msg) {
      msg.style.display = 'flex';
      msg.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    // Delay before next message
    setTimeout(() => {
      popUpMessages(index + 1);
    }, 500); // adjust speed if needed
  }

  // Start the sequence
  popUpMessages();
};

