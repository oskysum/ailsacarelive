// Only allow POST requests
if (event.httpMethod !== 'POST') {
    console.log('Error: Method not allowed');
    return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
}

try {
    console.log('Parsing request body...');
    const requestBody = JSON.parse(event.body);
    console.log('Request body keys:', Object.keys(requestBody));
    
    const { orderId, formData, followUpAnswers } = requestBody;

    // Validate required data
    if (!orderId) {
        console.log('Error: Missing orderId');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing orderId' })
        };
    }
    
    if (!formData) {
        console.log('Error: Missing formData');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing formData' })
        };
    }
    
    if (!followUpAnswers) {
        console.log('Error: Missing followUpAnswers');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing followUpAnswers' })
        };
    }

    console.log('Order ID:', orderId);
    console.log('Form data keys:', Object.keys(formData));
    console.log('Follow-up answers:', followUpAnswers);

    // Initialize Anthropic client
    console.log('Initializing Anthropic client...');
    
    if (!process.env.CLAUDE_API_KEY) {
        console.log('Error: CLAUDE_API_KEY not found in environment');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: Missing API key' })
        };
    }
    
    const anthropic = new Anthropic({
        apiKey: process.env.CLAUDE_API_KEY
    });
    console.log('Anthropic client initialized');

    // Calculate concern metrics
    console.log('Calculating concern metrics...');
    const scores = [
        followUpAnswers.emotionalDistance,
        followUpAnswers.technologyPrivacy,
        followUpAnswers.scheduleChanges,
        followUpAnswers.appearanceChanges,
        followUpAnswers.intimacyChanges,
        followUpAnswers.defensiveness,
        followUpAnswers.interestInYou
    ];

    console.log('Scores array:', scores);

    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highConcernCount = scores.filter(s => s >= 4).length;
    const moderateConcernCount = scores.filter(s => s === 3).length;
    
    // Determine concern level (out of 10)
    let concernLevel;
    if (averageScore <= 1.5) concernLevel = 1;
    else if (averageScore <= 2.0) concernLevel = 3;
    else if (averageScore <= 2.5) concernLevel = 4;
    else if (averageScore <= 3.0) concernLevel = 5;
    else if (averageScore <= 3.5) concernLevel = 6;
    else if (averageScore <= 4.0) concernLevel = 7;
    else if (averageScore <= 4.5) concernLevel = 8;
    else concernLevel = 9;

    // Health score is inverse of concern (1-10 scale)
    const healthScore = Math.max(1, 11 - concernLevel);

    console.log('Average score:', averageScore);
    console.log('Concern level:', concernLevel);
    console.log('Health score:', healthScore);

    // Create detailed prompt for Claude
    const prompt = `You are a compassionate relationship counselor providing a confidential assessment. Analyze this relationship situation with nuance, empathy, and professional insight.
