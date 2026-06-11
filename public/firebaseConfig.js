const firebaseConfig = {
  apiKey: "AIzaSyBHnQdEjDmlcoM_WawqNcVDxcmYAX-7hoo",
  authDomain: "dialeco-d7b8f.firebaseapp.com",
  databaseURL: "https://dialeco-d7b8f-default-rtdb.firebaseio.com",
  projectId: "dialeco-d7b8f",
  storageBucket: "dialeco-d7b8f-user-recordings",
  messagingSenderId: "436569938390",
  appId: "1:436569938390:web:df1e22515cff3f507e2c77",
  measurementId: "G-MPSF7SLJGD"
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { firebaseConfig };
}

// Make available globally
window.firebaseConfig = firebaseConfig;
