# Firebase Security Rules Deployment Guide

## Overview
This project now includes comprehensive security rules for both Firestore and Firebase Storage to protect your audio message data.

## Security Features Implemented

### 1. **Authentication Required**
   - Users must be logged in to record and save audio messages
   - Automatic redirect to login page if not authenticated

### 2. **Firestore Security Rules** (`firestore.rules`)
   - ✅ Only authenticated users can access the database
   - ✅ Users can only read their own audio messages
   - ✅ Users can only create messages with their own user ID
   - ✅ Data validation ensures all required fields are present
   - ✅ Protection against data tampering (userId cannot be changed)
   - ✅ File path validation to prevent unauthorized access

### 3. **Storage Security Rules** (`storage.rules`)
   - ✅ Audio files stored in user-specific folders (`users/{userId}/recordings/`)
   - ✅ Users can only access their own audio files
   - ✅ File size limit: 50MB per audio file
   - ✅ Content type validation (only audio files allowed)
   - ✅ Filename pattern validation (green_timestamp.mp4)

### 4. **Data Structure Protection**
   Each audio message document includes:
   - `userId`: Firebase Auth UID (verified)
   - `userEmail`: User's email
   - `userName`: User's display name
   - `fileName`: Storage path (validated)
   - `url`: Download URL
   - `timestamp`: Server timestamp
   - `recordedAt`: Client timestamp
   - `type`: "sent" (message type)

## Deployment Instructions

### Option 1: Using Firebase Console (Manual)

#### Deploy Firestore Rules:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `dialeco-d7b8f`
3. Navigate to **Firestore Database** → **Rules** tab
4. Copy the contents of `firestore.rules` file
5. Paste into the rules editor
6. Click **Publish**

#### Deploy Storage Rules:
1. In Firebase Console, navigate to **Storage** → **Rules** tab
2. Copy the contents of `storage.rules` file
3. Paste into the rules editor
4. Click **Publish**

### Option 2: Using Firebase CLI (Recommended)

```bash
# Install Firebase CLI if you haven't already
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not done already)
firebase init

# Select:
# - Firestore
# - Storage
# - Hosting (optional)

# Deploy security rules
firebase deploy --only firestore:rules,storage:rules

# Or deploy everything
firebase deploy
```

## Testing Security

After deploying the rules, test that:

1. **Unauthorized Access Blocked**: Try accessing the database without logging in
   - Expected: Access denied or redirect to login

2. **User Isolation**: Log in as User A, then try to access User B's audio files
   - Expected: Access denied

3. **Valid Recording**: Log in and record an audio message
   - Expected: Success - audio saved to Firestore and Storage

4. **Invalid Data**: Try to modify userId or other protected fields
   - Expected: Permission denied

## Security Best Practices

✅ **Implemented**:
- Authentication required for all operations
- User data isolation
- Data validation
- File type and size restrictions
- Server-side timestamps

📋 **Additional Recommendations**:
- Regularly review Firebase security rules
- Monitor Firebase Console for unusual activity
- Enable Firebase App Check for additional protection
- Set up Firebase Security Rules testing
- Implement rate limiting if needed
- Use HTTPS only (already configured)

## Troubleshooting

### "Permission Denied" Error
- Ensure user is logged in
- Check that Firebase rules are deployed
- Verify user's authentication token is valid

### Audio Not Saving
- Check browser console for errors
- Verify Firebase configuration
- Ensure Firestore and Storage are enabled in Firebase Console

### Rules Not Working
- Wait 1-2 minutes after deploying rules
- Clear browser cache
- Check Firebase Console for rule syntax errors

## Support

For issues or questions about security implementation, check:
- [Firebase Security Rules Documentation](https://firebase.google.com/docs/rules)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- Firebase Console → Project Settings → Service Accounts
