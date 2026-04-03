// Function to fetch a random riddle from the server
async function fetchRiddle() {
    try {
        // We use a relative path so it works on both localhost AND Render
        const response = await fetch('/api/riddle');
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        
        // Assuming your database columns are 'riddle_text' and 'answer'
        // Update these property names if your SQL columns are different!
        displayRiddle(data.riddle_text, data.answer);

    } catch (error) {
        console.error('Error fetching riddle:', error);
        
        // Updated error message for the live site
        alert("Oops! The game couldn't connect to the riddle database. Please check if your Railway database is active and the Environment Variables are correct in Render.");
    }
}

// Function to display the riddle on the UI
function displayRiddle(question, answer) {
    const riddleElement = document.getElementById('riddle-question');
    const answerElement = document.getElementById('riddle-answer');

    if (riddleElement) riddleElement.innerText = question;
    
    // Hide the answer initially if you have a "Show Answer" button logic
    if (answerElement) {
        answerElement.innerText = answer;
        answerElement.style.display = 'none'; 
    }
}

// Example: Trigger the fetch when the "Roll" button is clicked
const rollButton = document.getElementById('roll-button');
if (rollButton) {
    rollButton.addEventListener('click', () => {
        // Your dice rolling logic here...
        fetchRiddle();
    });
}

// Socket.io logic for multiplayer (as seen in your server.js)
const socket = io();

function movePlayer(position) {
    socket.emit('playerMove', { position: position });
}

socket.on('updateBoard', (data) => {
    console.log('Another player moved to:', data.position);
    // Logic to update other players' positions on your grid
});
