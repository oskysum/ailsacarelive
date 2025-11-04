const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
    console.log('=== ANALYZE FUNCTION STARTED ===');
    console.log('HTTP Method:', req.method);
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        console.log('Error: Method not allowed');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('Parsing request body...');
        const requestBody = req.body;
        console.log('Request body keys:', Object.keys(requestBody));
        
        const { orderId, formData, followUpAnswers } = requestBody;

        // Validate required data
        if (!orderId) {
            console.log('Error: Missing orderId');
            return res.status(400).json({ error: 'Missing orderId' });
        }
        
        if (!formData) {
            console.log('Error: Missing formData');
            return res.status(400).json({ error: 'Missing formData' });
        }
        
        if (!followUpAnswers) {
            console.log('Error: Missing followUpAnswers');
            return res.status(400).json({ error: 'Missing followUpAnswers' });
        }

        console.log('Order ID:', orderId);
        console.log('Form data keys:', Object.keys(formData));
        console.log('Follow-up answers:', followUpAnswers);

        // Initialize Anthropic client
        console.log('Initializing Anthropic client...');
        
        if (!process.env.CLAUDE_API_KEY) {
            console.log('Error: CLAUDE_API_KEY not found in environment');
            return res.status(500).json({ error: 'Server configuration error: Missing API key' });
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
        const prompt = `You are a compassionate relationship counselor. Analyze this relationship situation with empathy and professional insight.

CLIENT INFORMATION:
- User Age: ${formData.userAge}
- Partner Age: ${formData.partnerAge}
- Relationship Duration: ${formData.relationshipDuration}
- Primary Concerns: ${formData.concerns}

BEHAVIORAL ASSESSMENT SCORES (1=No Concern, 5=High Concern):
1. Emotional Distance: ${followUpAnswers.emotionalDistance}/5
2. Technology/Privacy Changes: ${followUpAnswers.technologyPrivacy}/5
3. Schedule/Availability Changes: ${followUpAnswers.scheduleChanges}/5
4. Appearance/Spending Changes: ${followUpAnswers.appearanceChanges}/5
5. Intimacy Changes: ${followUpAnswers.intimacyChanges}/5
6. Defensiveness: ${followUpAnswers.defensiveness}/5
7. Interest in Partner's Life: ${followUpAnswers.interestInYou}/5

CALCULATED METRICS:
- Average Score: ${averageScore.toFixed(2)}
- High Concern Areas: ${highConcernCount}
- Moderate Concern Areas: ${moderateConcernCount}
- Concern Level: ${concernLevel}/10
- Health Score: ${healthScore}/10

Please provide analysis with these sections:

1. BEHAVIORAL PATTERN ANALYSIS
2. CONTEXT AND ALTERNATIVE EXPLANATIONS
3. RECOMMENDED ACTIONS
4. COMMUNICATION STRATEGIES

Be empathetic and avoid making accusations. Emphasize that behavior changes have multiple possible explanations.`;

        console.log('Calling Claude API...');
        
        let message;
        try {
            message = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                temperature: 0.7,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });
            console.log('Claude API call successful');
        } catch (apiError) {
            console.error('Claude API Error:', apiError);
            throw new Error(`Claude API failed: ${apiError.message}`);
        }

        const analysisText = message.content[0].text;
        console.log('Analysis received, length:', analysisText.length);

        // Parse the response into sections
        const sections = {
            detailedAnalysis: '',
            contextAnalysis: '',
            expertAdvice: '',
            communicationTips: ''
        };

        const patterns = analysisText.split(/\d\.\s+[A-Z\s]+:/);
        
        if (patterns.length >= 5) {
            sections.detailedAnalysis = patterns[1].trim();
            sections.contextAnalysis = patterns[2].trim();
            sections.expertAdvice = patterns[3].trim();
            sections.communicationTips = patterns[4].trim();
            console.log('Sections parsed successfully');
        } else {
            console.log('Using full text as analysis');
            sections.detailedAnalysis = analysisText;
            sections.contextAnalysis = 'Multiple factors can contribute to behavioral changes in relationships.';
            sections.expertAdvice = 'Consider having an open conversation with your partner about your concerns.';
            sections.communicationTips = 'Use "I feel" statements to express emotions without blaming.';
        }

        // Send email with results
        console.log('Preparing to send email...');
        try {
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9f9f9; }
        .score-box { display: inline-block; background: white; padding: 20px; margin: 10px; border-radius: 8px; text-align: center; }
        .score-value { font-size: 36px; font-weight: bold; color: #667eea; }
        .section { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
        .section h2 { color: #667eea; margin-top: 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Your Relationship Assessment Results</h1>
        <p>Order ID: ${orderId}</p>
    </div>
    
    <div class="content">
        <div style="text-align: center;">
            <div class="score-box">
                <div class="score-value">${concernLevel}/10</div>
                <div>Concern Level</div>
            </div>
            <div class="score-box">
                <div class="score-value">${healthScore}/10</div>
                <div>Health Score</div>
            </div>
        </div>
        
        <div class="section">
            <h2>Behavioral Pattern Analysis</h2>
            <p>${sections.detailedAnalysis.replace(/\n/g, '<br>')}</p>
        </div>
        
        <div class="section">
            <h2>Context & Alternative Explanations</h2>
            <p>${sections.contextAnalysis.replace(/\n/g, '<br>')}</p>
        </div>
        
        <div class="section">
            <h2>Recommended Actions</h2>
            <p>${sections.expertAdvice.replace(/\n/g, '<br>')}</p>
        </div>
        
        <div class="section">
            <h2>Communication Strategies</h2>
            <p>${sections.communicationTips.replace(/\n/g, '<br>')}</p>
        </div>
    </div>
    
    <div class="footer">
        <p>This assessment is for informational purposes only and does not replace professional counseling.</p>
        <p>© ${new Date().getFullYear()} Relationship Assessment Service</p>
    </div>
</body>
</html>
            `;

            await transporter.sendMail({
                from: `"Relationship Assessment" <${process.env.EMAIL_USER}>`,
                to: formData.userEmail,
                subject: 'Your Relationship Assessment Results',
                html: emailHtml
            });

            console.log('Email sent successfully to:', formData.userEmail);
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Continue anyway - don't fail the whole request if email fails
        }

        console.log('Preparing response...');
        const response = {
            success: true,
            analysis: {
                concernLevel: `${concernLevel}/10`,
                healthScore: `${healthScore}/10`,
                detailedAnalysis: sections.detailedAnalysis,
                contextAnalysis: sections.contextAnalysis,
                expertAdvice: sections.expertAdvice,
                communicationTips: sections.communicationTips
            }
        };

        console.log('=== ANALYZE FUNCTION COMPLETED SUCCESSFULLY ===');
        return res.status(200).json(response);

    } catch (error) {
        console.error('=== ERROR IN ANALYZE FUNCTION ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: 'Failed to generate analysis. Please try again or contact support.',
            details: error.message
        });
    }
};
