# Army Radio - Testing & Troubleshooting Guide

## 🎯 Quick Test (No Friends Needed)

### Step 1: Test the App Locally
1. Open your Netlify URL on your phone
2. Enter a callsign (e.g., "Alpha-1")
3. Tap **🧪 TEST LOCALLY** button
4. You should see the radio screen

### Step 2: Test Microphone
1. Tap the **🎤 TEST** button on the lobby
2. Allow microphone permission when prompted
3. If it shows "✓ Working" → mic is good ✅
4. If it shows "✗ Blocked" → fix permissions (see below)

### Step 3: Test Push-to-Talk
1. Hold the **PUSH TO TALK** button
2. Speak into your phone
3. You should see "🎙️ Transmitting (TEST MODE)..."
4. Release the button
5. You should hear radio static sounds

### Step 4: Test Receiving
1. Tap **SIMULATE INCOMING** button (top right in test mode)
2. You should see a simulated incoming message
3. You should hear radio static

---

## 🔧 Fix Microphone Issues

### Android Chrome:
1. Go to **Settings** → **Apps** → **Chrome**
2. Tap **Permissions**
3. Find **Microphone**
4. Set to **Allow**
5. Refresh the page

### If Still Not Working:
- Try a different browser (Firefox, Edge)
- Check if another app is using the mic
- Restart your phone
- Clear Chrome cache: Settings → Apps → Chrome → Storage → Clear Cache

---

## 🌐 Testing with Friends

### Person A (Host):
1. Open the app
2. Enter callsign (e.g., "Alpha-1")
3. Tap **📡 CREATE ROOM**
4. Wait for status to show **WAITING-FOR-PEERS**
5. Copy the 6-letter room code
6. Share the **Netlify URL + room code** with friends

### Person B (Join):
1. Open the **same Netlify URL**
2. Enter callsign (e.g., "Bravo-2")
3. Enter the 6-letter room code
4. Tap **🔗 JOIN ROOM**
5. Wait for status to show **WAITING-FOR-PEERS**

### Both Should See:
- Each other's callsigns under "CONNECTED UNITS"
- Status shows "WAITING-FOR-PEERS" (not "ERROR")

---

## 🐛 Debug Mode

### Enable Debug:
1. On the radio screen, tap **▶ SHOW DEBUG** at the bottom
2. You'll see connection logs

### What to Look For:
- `Peer opened with ID: army-radio-XXXXXX` → Connected to server ✅
- `Room created successfully` → Room is ready ✅
- `Peer identified as: Bravo-2` → Friend connected ✅
- `Receiving audio stream from: Bravo-2` → Audio working ✅

### Common Errors:
- `Room not found` → Wrong code or host is offline
- `Network error` → Internet connection issue
- `Connection timeout` → PeerJS server might be down
- `peer-unavailable` → Room code doesn't exist

---

## 📱 Browser Requirements

### ✅ Works On:
- Chrome (Android/iOS) - **RECOMMENDED**
- Firefox (Android)
- Edge (Android)
- Safari (iOS 11+)

### ❌ May Not Work:
- Samsung Internet (limited WebRTC support)
- Opera Mini
- Old browsers

### Important:
- **HTTPS required** (Netlify provides this automatically)
- **Microphone permission required**
- **WebRTC support required**

---

## 🔥 Common Problems & Solutions

### Problem: "Nothing shows up"
**Solution:**
1. Hard refresh: Pull down to refresh or Ctrl+F5
2. Clear browser cache
3. Try incognito/private mode
4. Try a different browser

### Problem: "Room not found"
**Solution:**
1. Make sure host is online and sees "WAITING-FOR-PEERS"
2. Check room code is exactly 6 letters (no spaces)
3. Both must use the same Netlify URL
4. Try creating a new room

### Problem: "Can't hear others"
**Solution:**
1. Check phone volume (not on silent)
2. Check app volume slider
3. Make sure they're actually transmitting (holding PTT)
4. Check debug log for "Receiving audio stream"

### Problem: "Others can't hear me"
**Solution:**
1. Test mic with **🎤 TEST** button
2. Make sure you're holding PTT while talking
3. Check debug log for "Sending audio to X peers"
4. Try speaking louder

### Problem: "Connection fails"
**Solution:**
1. Check internet connection
2. Try WiFi instead of mobile data
3. Try mobile data instead of WiFi
4. Some networks block WebRTC (corporate/school WiFi)
5. Try a different network

### Problem: "App crashes or shows error"
**Solution:**
1. Tap **🔄 RELOAD APP** on error screen
2. Clear browser cache
3. Try incognito mode
4. Try a different browser
5. Restart your phone

---

## 🎮 Testing Checklist

Use this checklist to verify everything works:

- [ ] App loads on phone
- [ ] Can enter callsign
- [ ] Mic test shows "✓ Working"
- [ ] Test mode works (TEST LOCALLY button)
- [ ] Can hold PTT and see "Transmitting"
- [ ] Can hear radio static sounds
- [ ] Can simulate incoming messages
- [ ] Can create a room (status: WAITING-FOR-PEERS)
- [ ] Friend can join the room
- [ ] Both see each other in "CONNECTED UNITS"
- [ ] Can talk and hear each other

---

## 📞 Need Help?

If you're still having issues:

1. **Take a screenshot** of:
   - The lobby screen
   - The debug log (tap SHOW DEBUG)
   - Any error messages

2. **Check browser console** (if on desktop):
   - Open Chrome DevTools (F12)
   - Go to Console tab
   - Look for red error messages

3. **Try these in order:**
   - Hard refresh the page
   - Clear browser cache
   - Try incognito mode
   - Try a different browser
   - Try a different device
   - Try a different network

---

## 🎯 Expected Behavior

### When Everything Works:
1. **Lobby Screen:**
   - Can enter callsign
   - Mic test works
   - Can create/join rooms
   - Test mode works

2. **Radio Screen:**
   - Shows room code
   - Shows connected units
   - Status shows "WAITING-FOR-PEERS"
   - Can hold PTT to talk
   - Can hear others
   - Radio static sounds play
   - Messages appear in log

3. **Multiplayer:**
   - Host creates room
   - Others join with code
   - All see each other
   - One talks, all hear
   - Radio effects work

---

## 🔒 Privacy & Security

- **Peer-to-peer**: Audio goes directly between phones
- **No server storage**: Nothing is recorded
- **HTTPS encrypted**: All connections are secure
- **Microphone only active when PTT is held**
- **No data collection**: App doesn't track you

---

Good luck! 🎖️
