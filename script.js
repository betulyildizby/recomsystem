// Festival Content Data
const festivalContent = [
    { title: "Empathy Creatures", tags: ["SENSORY_WELLNESS", "VR_EXPERIENCE"], score: 0 },
    { title: "A song within us", tags: ["ART_CULTURE", "VR_EXPERIENCE"], score: 0 },
    { title: "The eye and I", tags: ["SOCIETY_TECH", "VR_EXPERIENCE"], score: 0 },
    { title: "Épanouir", tags: ["SENSORY_WELLNESS", "VR_EXPERIENCE"], score: 0 },
    { title: "Care", tags: ["SENSORY_WELLNESS", "AR_STAND"], score: 0 },
    { title: "Jailbirds", tags: ["SOCIETY_TECH", "CREATOR_TALK"], score: 0 },
    { title: "Mandala", tags: ["TECH_DISCOVERY", "AR_STAND"], score: 0 },
    { title: "Mechanical Souls", tags: ["SOCIETY_TECH", "VR_EXPERIENCE"], score: 0 }
];

// Categories
const categories = {
    "SENSORY_WELLNESS": {
        description: "Sensory & Wellness Experiences (relaxation, mindfulness, wellbeing)",
        icon: "🧘"
    },
    "ART_CULTURE": {
        description: "Art & Culture (creative, artistic expressions)",
        icon: "🎨"
    },
    "SOCIETY_TECH": {
        description: "Society & Technology (social impact, tech discovery)",
        icon: "🌐"
    },
    "TECH_DISCOVERY": {
        description: "Technology Discovery (innovation, interactive technology)",
        icon: "🔬"
    }
};

let currentQuestionIndex = 0;
let userRatings = {};
let selectedCategories = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set all categories to 0 initially
    Object.keys(categories).forEach(cat => {
        userRatings[cat] = 0;
    });
});

function startQuestions() {
    showStep('questions-step');
    renderQuestion();
}

function renderQuestion() {
    const categoryKeys = Object.keys(categories);
    const currentCategory = categoryKeys[currentQuestionIndex];
    const categoryData = categories[currentCategory];
    const isInterested = userRatings[currentCategory] > 0;

    let html = `
        <div class="question-item">
            <div class="question-text">Are you interested in:</div>
            <div class="question-description">${categoryData.icon} ${categoryData.description}?</div>
            <div class="button-group" style="display: flex; gap: 10px; margin-top: 20px;">
                <button class="btn ${isInterested ? 'active' : ''}" onclick="setInterest('${currentCategory}', true)" style="flex: 1; background: ${isInterested ? '#667eea' : '#e9ecef'}; color: ${isInterested ? 'white' : '#333'};">
                    ✓ Yes
                </button>
                <button class="btn ${isInterested ? '' : 'active'}" onclick="setInterest('${currentCategory}', false)" style="flex: 1; background: ${!isInterested ? '#667eea' : '#e9ecef'}; color: ${!isInterested ? 'white' : '#333'};">
                    ✗ No
                </button>
            </div>
    `;

    // If YES is selected, show rating stars
    if (isInterested) {
        html += `
            <div style="margin-top: 20px;">
                <div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">Rate your interest (1-5 stars):</div>
                <div class="rating-container" id="rating-${currentCategory}">
                    ${[1, 2, 3, 4, 5].map(star => `
                        <span class="star ${userRatings[currentCategory] === star ? 'active' : ''}" 
                              onclick="setRating('${currentCategory}', ${star})">⭐</span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    html += `</div>`;

    document.getElementById('questions-content').innerHTML = html;
    document.getElementById('current-question').textContent = currentQuestionIndex + 1;

    // Update buttons visibility
    document.getElementById('prev-btn').style.display = 'block';
    document.getElementById('next-btn').textContent = currentQuestionIndex === Object.keys(categories).length - 1 ? 'See Summary →' : 'Next →';
}

function setInterest(category, interested) {
    if (interested) {
        // If selecting YES but no rating yet, set to 3 (default)
        if (userRatings[category] === 0) {
            userRatings[category] = 3;
        }
    } else {
        // If selecting NO, set to 0
        userRatings[category] = 0;
    }
    renderQuestion();
}

function setRating(category, rating) {
    // Set the rating (1-5)
    userRatings[category] = rating;
    
    // Update visual
    const stars = document.querySelectorAll(`#rating-${category} .star`);
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

function nextQuestion() {
    const categoryKeys = Object.keys(categories);
    if (currentQuestionIndex < categoryKeys.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
    } else {
        showSummary();
    }
}

function previousQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
    } else {
        // Go back to welcome screen from first question
        showStep('welcome-step');
    }
}

function showSummary() {
    showStep('summary-step');
    const categoryKeys = Object.keys(categories);
    selectedCategories = categoryKeys.filter(cat => userRatings[cat] > 0);

    let summaryHtml = '';
    
    if (selectedCategories.length === 0) {
        summaryHtml = '<div class="no-results">No categories selected. All experiences will be shown equally.</div>';
    } else {
        selectedCategories.forEach(cat => {
            const stars = '⭐'.repeat(userRatings[cat]);
            summaryHtml += `
                <div class="summary-item">
                    <strong>${categories[cat].icon} ${cat}</strong><br>
                    ${categories[cat].description}<br>
                    Rating: ${stars}
                </div>
            `;
        });
    }

    document.getElementById('summary-content').innerHTML = summaryHtml;
}

function showResults() {
    showStep('results-step');
    
    // Calculate scores for each content
    festivalContent.forEach(content => {
        let score = 0;
        content.tags.forEach(tag => {
            if (userRatings[tag] && userRatings[tag] > 0) {
                score += userRatings[tag] * 15;
            }
        });
        content.score = score;
    });

    // Sort by score descending
    const sortedContent = [...festivalContent].sort((a, b) => b.score - a.score);

    // Render results
    let resultsHtml = '';
    sortedContent.forEach(item => {
        const tagsHtml = item.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        resultsHtml += `
            <div class="result-card">
                <div class="result-title">${item.title}</div>
                <div class="result-tags">${tagsHtml}</div>
                <div class="result-score">Match Score: ${item.score > 0 ? item.score : 'Not rated'}</div>
            </div>
        `;
    });

    document.getElementById('results-content').innerHTML = resultsHtml;
}

function restart() {
    currentQuestionIndex = 0;
    userRatings = {};
    selectedCategories = [];
    Object.keys(categories).forEach(cat => {
        userRatings[cat] = 0;
    });
    showStep('welcome-step');
}

function showStep(stepId) {
    // Hide all steps
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Show target step
    document.getElementById(stepId).classList.add('active');
}
