const socket = io();

let localStream;
let remoteStream;
let peerConnection;
let currentRoomId;
let isVideoEnabled = true;
let isAudioEnabled = true;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM Elements
const roomSection = document.getElementById('roomSection');
const videoSection = document.getElementById('videoSection');
const roomIdInput = document.getElementById('roomId');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const myRoomIdDisplay = document.getElementById('myRoomId');
const videoRoomIdDisplay = document.getElementById('videoRoomId');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const endCallBtn = document.getElementById('endCall');
const statusDiv = document.getElementById('status');

// Event Listeners
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
toggleVideoBtn.addEventListener('click', toggleVideo);
toggleAudioBtn.addEventListener('click', toggleAudio);
endCallBtn.addEventListener('click', endCall);

// Socket Event Listeners
socket.on('connect', () => {
    console.log('Connected to server');
    updateStatus('Connected');
});

socket.on('room-created', (roomId) => {
    console.log('Room created:', roomId);
    currentRoomId = roomId;
    
    // Display the room ID in BOTH locations
    const roomIdHTML = `
        <div style="text-align: center; padding: 20px; background: #fff; border: 3px solid #667eea; border-radius: 15px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 1rem; color: #666;">Share this Room ID:</p>
            <p style="margin: 0; font-size: 2rem; font-weight: bold; color: #667eea; letter-spacing: 3px;">${roomId}</p>
            <p style="margin: 10px 0 0 0; font-size: 0.9rem; color: #999;">Anyone with this code can join your call</p>
        </div>
    `;
    
    myRoomIdDisplay.innerHTML = roomIdHTML;
    myRoomIdDisplay.style.display = 'block';
    
    videoRoomIdDisplay.innerHTML = roomIdHTML;
    videoRoomIdDisplay.style.display = 'block';
    
    updateStatus('Waiting for someone to join...');
    
    // Show video section immediately
    showVideoSection();
});

socket.on('room-joined', (roomId) => {
    console.log('Room joined:', roomId);
    currentRoomId = roomId;
    
    // Show room ID in video section
    videoRoomIdDisplay.innerHTML = `
        <div style="text-align: center; padding: 15px; background: #f0f4ff; border-radius: 10px; margin-bottom: 15px;">
            <p style="margin: 0; font-size: 1.2rem; color: #667eea;"><strong>Room:</strong> ${roomId}</p>
        </div>
    `;
    videoRoomIdDisplay.style.display = 'block';
    
    updateStatus('Connected to room');
});

socket.on('user-connected', async () => {
    console.log('User connected to room');
    updateStatus('User connected - Starting call...');
    await createOffer();
});

socket.on('offer', async (offer) => {
    console.log('Received offer');
    await handleOffer(offer);
});

socket.on('answer', async (answer) => {
    console.log('Received answer');
    await handleAnswer(answer);
});

socket.on('ice-candidate', async (candidate) => {
    await handleIceCandidate(candidate);
});

socket.on('user-disconnected', () => {
    console.log('User disconnected');
    updateStatus('User disconnected');
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
});

socket.on('room-full', () => {
    alert('Room is full. Only 2 users allowed per room.');
});

socket.on('error', (message) => {
    console.error('Socket error:', message);
    alert(message);
    updateStatus('Error occurred');
});

// Functions
async function createRoom() {
    try {
        console.log('Creating room...');
        await initLocalStream();
        const roomId = generateRoomId();
        console.log('Generated room ID:', roomId);
        socket.emit('create-room', roomId);
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to access camera/microphone. Please check permissions.');
    }
}

async function joinRoom() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }

    try {
        console.log('Joining room:', roomId);
        await initLocalStream();
        socket.emit('join-room', roomId);
        showVideoSection();
    } catch (error) {
        console.error('Error joining room:', error);
        alert('Failed to access camera/microphone. Please check permissions.');
    }
}

async function initLocalStream() {
    try {
        console.log('Requesting camera and microphone access...');
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true
        });
        localVideo.srcObject = localStream;
        console.log('Local stream initialized');
    } catch (error) {
        console.error('Failed to get local stream:', error);
        throw error;
    }
}

function createPeerConnection() {
    console.log('Creating peer connection...');
    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        console.log('Received remote track');
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
        updateStatus('Connected - Call in progress');
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                roomId: currentRoomId,
                candidate: event.candidate
            });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        updateStatus(`Connection: ${peerConnection.connectionState}`);
    };
}

async function createOffer() {
    console.log('Creating offer...');
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', {
        roomId: currentRoomId,
        offer: offer
    });
}

async function handleOffer(offer) {
    console.log('Handling offer...');
    createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', {
        roomId: currentRoomId,
        answer: answer
    });
}

async function handleAnswer(answer) {
    console.log('Handling answer...');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

function toggleVideo() {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    toggleVideoBtn.classList.toggle('video-on', isVideoEnabled);
    toggleVideoBtn.classList.toggle('video-off', !isVideoEnabled);
}

function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks()[0].enabled = isAudioEnabled;
    toggleAudioBtn.classList.toggle('audio-on', isAudioEnabled);
    toggleAudioBtn.classList.toggle('audio-off', !isAudioEnabled);
}

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    if (currentRoomId) {
        socket.emit('leave-room', currentRoomId);
    }
    location.reload();
}

function showVideoSection() {
    console.log('Showing video section');
    roomSection.style.display = 'none';
    videoSection.style.display = 'block';
}

function generateRoomId() {
    // Generate a 6-character uppercase room ID
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function updateStatus(message) {
    console.log('Status:', message);
    statusDiv.textContent = message;
}