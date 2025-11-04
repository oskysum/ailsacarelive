const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');

// Helper function to ensure rich paragraph content
function enhanceContent(text, minParagraphs = 3) {
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    
    if (paragraphs.length < minParagraphs) {
        console.log(`Content has ${paragraphs.length} paragraphs, less than ${minParagraphs} - may need enhancement`);
    }
    
    return paragraphs.join('\n\n');
}

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

Please provide a detailed, empathetic analysis with these EXACT section headers:

1. BEHAVIORAL PATTERN ANALYSIS
2. CONTEXT AND ALTERNATIVE EXPLANATIONS
3. RECOMMENDED ACTIONS
4. COMMUNICATION STRATEGIES

IMPORTANT FORMATTING RULES:
- Write in natural, flowing paragraphs (not bullet points or lists)
- Each section should be 3-5 substantial paragraphs
- Use plain text only - NO markdown formatting (no **, ##, -, or *)
- Be empathetic and avoid accusations
- Emphasize that behavior changes have multiple possible explanations
- Use specific examples from the scores when relevant
- Make it feel personal and thoughtful, not generic

Focus on providing deep, nuanced insights that help the person understand their situation from multiple angles.`;

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

        // Parse the response into sections with better handling
        const sections = {
            detailedAnalysis: '',
            contextAnalysis: '',
            expertAdvice: '',
            communicationTips: ''
        };

        // Split by numbered section headers
        const sectionRegex = /\d+\.\s+(BEHAVIORAL PATTERN ANALYSIS|CONTEXT AND ALTERNATIVE EXPLANATIONS|RECOMMENDED ACTIONS|COMMUNICATION STRATEGIES)/gi;
        const parts = analysisText.split(sectionRegex);

        console.log('Split parts count:', parts.length);

        if (parts.length >= 8) {
            // parts[0] is before first section
            // parts[1] is "BEHAVIORAL PATTERN ANALYSIS", parts[2] is its content
            // parts[3] is "CONTEXT AND...", parts[4] is its content, etc.
            sections.detailedAnalysis = parts[2].trim();
            sections.contextAnalysis = parts[4].trim();
            sections.expertAdvice = parts[6].trim();
            sections.communicationTips = parts[8].trim();
            console.log('Sections parsed successfully');
        } else {
            console.log('Fallback: Using full text as analysis');
            // Fallback - use the full response
            sections.detailedAnalysis = analysisText;
            sections.contextAnalysis = 'Your relationship is experiencing some challenges, which is completely normal. Many factors beyond infidelity can explain behavioral changes, including work stress, personal struggles, mental health challenges, or natural relationship evolution. It\'s important to approach this with curiosity rather than suspicion.\n\nConsider the broader context of your partner\'s life. Are there new pressures at work? Family issues? Health concerns? Sometimes partners withdraw not because they\'re hiding something, but because they\'re struggling with something they don\'t know how to share.\n\nThe patterns you\'ve noticed deserve attention, but they also deserve compassionate investigation. Creating a safe space for honest dialogue is often more revealing than surveillance or accusation.';
            sections.expertAdvice = 'Start with gentle, non-accusatory conversations using "I" statements. Express your feelings without blaming. Consider couples counseling as a proactive step, not a last resort. Focus on rebuilding connection through quality time, active listening, and mutual understanding.\n\nSchedule a calm moment to share your observations. Frame them as concerns about the relationship, not accusations about behavior. Ask open-ended questions and genuinely listen to the answers. Sometimes the act of asking with love can create the opening your partner needs.\n\nRemember that addressing concerns early often prevents larger issues. Professional guidance can provide tools and perspectives that transform difficult conversations into opportunities for deeper connection.';
            sections.communicationTips = 'Use phrases like "I\'ve noticed" instead of "You always." This shifts the conversation from blame to observation. Ask open-ended questions and truly listen to the answers without planning your response while they speak.\n\nChoose calm moments for important conversations, not during conflicts or when either of you is stressed. Express appreciation for what\'s working in your relationship before addressing concerns. This creates emotional safety.\n\nShow vulnerability by sharing your fears. Often when one partner opens up authentically, it invites the other to do the same. Remember that the goal isn\'t to win an argument but to understand each other more deeply.';
        }

        // Clean up any remaining markdown artifacts
        Object.keys(sections).forEach(key => {
            sections[key] = sections[key]
                .replace(/\*\*/g, '')  // Remove bold markdown
                .replace(/##/g, '')    // Remove headers
                .replace(/^- /gm, '')  // Remove list markers at line starts
                .replace(/^\* /gm, '') // Remove asterisk list markers
                .trim();
        });

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
        .section p { margin-bottom: 15px; line-height: 1.8; }
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
            ${sections.detailedAnalysis.split('\n\n').map(p => `<p>${p}</p>`).join('')}
        </div>
        
        <div class="section">
            <h2>Context & Alternative Explanations</h2>
            ${sections.contextAnalysis.split('\n\n').map(p => `<p>${p}</p>`).join('')}
        </div>
        
        <div class="section">
            <h2>Recommended Actions</h2>
            ${sections.expertAdvice.split('\n\n').map(p => `<p>${p}</p>`).join('')}
        </div>
        
        <div class="section">
            <h2>Communication Strategies</h2>
            ${sections.communicationTips.split('\n\n').map(p => `<p>${p}</p>`).join('')}
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
                detailedAnalysis: enhanceContent(sections.detailedAnalysis),
                contextAnalysis: enhanceContent(sections.contextAnalysis),
                expertAdvice: enhanceContent(sections.expertAdvice),
                communicationTips: enhanceContent(sections.communicationTips)
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
