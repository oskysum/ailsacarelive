const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
    console.log('=== FUNCTION START ===');
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId, formData, followUpAnswers } = req.body;
        console.log('OrderID:', orderId);
        console.log('FormData exists:', !!formData);
        console.log('FollowUpAnswers exists:', !!followUpAnswers);

        if (!orderId || !formData || !followUpAnswers) {
            console.log('VALIDATION FAILED');
            return res.status(400).json({ error: 'Missing required data' });
        }

        console.log('VALIDATION PASSED - Starting Claude call');

        // Initialize Anthropic
        const anthropic = new Anthropic({
            apiKey: process.env.CLAUDE_API_KEY
        });

        console.log('ANTHROPIC CLIENT CREATED');

        // Calculate metrics
        const scores = [
            followUpAnswers.emotionalDistance,
            followUpAnswers.technologyPrivacy,
            followUpAnswers.scheduleChanges,
            followUpAnswers.appearanceChanges,
            followUpAnswers.intimacyChanges,
            followUpAnswers.defensiveness,
            followUpAnswers.interestInYou
        ];

        const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const highConcernCount = scores.filter(s => s >= 4).length;
        
        let concernLevel;
        if (averageScore <= 1.5) concernLevel = 1;
        else if (averageScore <= 2.0) concernLevel = 3;
        else if (averageScore <= 2.5) concernLevel = 4;
        else if (averageScore <= 3.0) concernLevel = 5;
        else if (averageScore <= 3.5) concernLevel = 6;
        else if (averageScore <= 4.0) concernLevel = 7;
        else if (averageScore <= 4.5) concernLevel = 8;
        else concernLevel = 9;

        const healthScore = Math.max(1, 11 - concernLevel);

        let cheatingLikelihood;
        if (averageScore <= 2.0) {
            cheatingLikelihood = "Highly Unlikely";
        } else if (averageScore <= 2.8) {
            cheatingLikelihood = "Unlikely";
        } else if (averageScore <= 3.5) {
            cheatingLikelihood = "Inconclusive";
        } else if (averageScore <= 4.2) {
            cheatingLikelihood = "Possible";
        } else {
            cheatingLikelihood = "Likely";
        }

        console.log('METRICS CALCULATED');
        console.log('Average:', averageScore);
        console.log('Likelihood:', cheatingLikelihood);

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
- Cheating Likelihood Assessment: ${cheatingLikelihood}

Please provide a detailed, empathetic analysis organized into EXACTLY these four sections with these EXACT headers:

BEHAVIORAL PATTERN ANALYSIS
CONTEXT AND ALTERNATIVE EXPLANATIONS
RECOMMENDED ACTIONS
COMMUNICATION STRATEGIES

CRITICAL FORMATTING REQUIREMENTS:
- Use ONLY these four section headers, nothing else
- Write each section as 3-4 flowing paragraphs in plain text
- NO markdown formatting at all (no **, ##, -, *, or lists)
- NO sub-headers or additional titles within sections
- NO bullet points or numbered lists anywhere
- Write naturally as if speaking to a friend
- Be empathetic and avoid making definitive accusations
- Each paragraph should be substantial (4-6 sentences)

Remember: The user will see ONLY these four sections in their report. Make each section comprehensive and self-contained.`;

        console.log('CALLING CLAUDE API NOW...');
        
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 3500,
            temperature: 0.7,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        console.log('CLAUDE API SUCCESS');
        console.log('Response length:', message.content[0].text.length);

        const analysisText = message.content[0].text;

        // Parse sections
        const sections = {
            behavioralAnalysis: '',
            contextAnalysis: '',
            recommendedActions: '',
            communicationStrategies: ''
        };

        const parts = analysisText.split(/(?:BEHAVIORAL PATTERN ANALYSIS|Behavioral Pattern Analysis)/i);
        if (parts.length > 1) {
            const afterFirst = parts[1];
            const contextParts = afterFirst.split(/(?:CONTEXT AND ALTERNATIVE EXPLANATIONS|Context and Alternative Explanations)/i);
            if (contextParts.length > 1) {
                sections.behavioralAnalysis = contextParts[0].trim();
                const actionsParts = contextParts[1].split(/(?:RECOMMENDED ACTIONS|Recommended Actions)/i);
                if (actionsParts.length > 1) {
                    sections.contextAnalysis = actionsParts[0].trim();
                    const commParts = actionsParts[1].split(/(?:COMMUNICATION STRATEGIES|Communication Strategies)/i);
                    if (commParts.length > 1) {
                        sections.recommendedActions = commParts[0].trim();
                        sections.communicationStrategies = commParts[1].trim();
                    } else {
                        sections.recommendedActions = actionsParts[1].trim();
                    }
                } else {
                    sections.contextAnalysis = contextParts[1].trim();
                }
            } else {
                sections.behavioralAnalysis = afterFirst.trim();
            }
        } else {
            sections.behavioralAnalysis = analysisText;
        }

        // Clean up formatting
        Object.keys(sections).forEach(key => {
            sections[key] = sections[key]
                .replace(/\*\*/g, '')
                .replace(/#{1,6}\s/g, '')
                .replace(/^[-*]\s/gm, '')
                .replace(/^\d+\.\s/gm, '')
                .trim();
        });

        console.log('SECTIONS PARSED');

        // Try to send email (don't fail if this errors)
        try {
            console.log('ATTEMPTING EMAIL SEND');
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const getLikelihoodColor = (likelihood) => {
                switch(likelihood) {
                    case 'Highly Unlikely': return '#10b981';
                    case 'Unlikely': return '#84cc16';
                    case 'Inconclusive': return '#f59e0b';
                    case 'Possible': return '#f97316';
                    case 'Likely': return '#ef4444';
                    default: return '#667eea';
                }
            };

            const emailHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9f9f9; }
        .likelihood-scale { background: white; padding: 25px; margin: 20px 0; border-radius: 12px; text-align: center; border: 3px solid ${getLikelihoodColor(cheatingLikelihood)}; }
        .likelihood-label { font-size: 14px; color: #666; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .likelihood-value { font-size: 32px; font-weight: bold; color: ${getLikelihoodColor(cheatingLikelihood)}; margin: 10px 0; }
        .likelihood-scale-bar { display: flex; justify-content: space-between; margin-top: 15px; font-size: 11px; color: #999; }
        .score-box { display: inline-block; background: white; padding: 20px; margin: 10px; border-radius: 8px; text-align: center; }
        .score-value { font-size: 36px; font-weight: bold; color: #667eea; }
        .section { background: white; padding: 25px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
        .section h2 { color: #667eea; margin-top: 0; margin-bottom: 20px; font-size: 20px; }
        .section p { margin-bottom: 18px; line-height: 1.8; color: #444; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Your Relationship Assessment Results</h1>
        <p>Order ID: ${orderId}</p>
    </div>
    <div class="content">
        <div class="likelihood-scale">
            <div class="likelihood-label">Infidelity Likelihood Assessment</div>
            <div class="likelihood-value">${cheatingLikelihood}</div>
            <div class="likelihood-scale-bar">
                <span>Highly Unlikely</span>
                <span>Unlikely</span>
                <span>Inconclusive</span>
                <span>Possible</span>
                <span>Likely</span>
            </div>
        </div>
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
            ${sections.behavioralAnalysis.split('\n\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
        </div>
        <div class="section">
            <h2>Context & Alternative Explanations</h2>
            ${sections.contextAnalysis.split('\n\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
        </div>
        <div class="section">
            <h2>Recommended Actions</h2>
            ${sections.recommendedActions.split('\n\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
        </div>
        <div class="section">
            <h2>Communication Strategies</h2>
            ${sections.communicationStrategies.split('\n\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
        </div>
    </div>
    <div class="footer">
        <p>This assessment is for informational purposes only and does not replace professional counseling.</p>
        <p>© ${new Date().getFullYear()} Relationship Assessment Service</p>
    </div>
</body>
</html>`;

            await transporter.sendMail({
                from: `"Relationship Assessment" <${process.env.EMAIL_USER}>`,
                to: formData.userEmail,
                subject: 'Your Relationship Assessment Results',
                html: emailHtml
            });

            console.log('EMAIL SENT');
        } catch (emailError) {
            console.log('EMAIL FAILED (continuing anyway):', emailError.message);
        }

        console.log('PREPARING RESPONSE');

        const response = {
            success: true,
            analysis: {
                cheatingLikelihood: cheatingLikelihood,
                concernLevel: `${concernLevel}/10`,
                healthScore: `${healthScore}/10`,
                behavioralAnalysis: sections.behavioralAnalysis,
                contextAnalysis: sections.contextAnalysis,
                recommendedActions: sections.recommendedActions,
                communicationStrategies: sections.communicationStrategies
            }
        };

        console.log('SENDING SUCCESS RESPONSE');
        return res.status(200).json(response);

    } catch (error) {
        console.error('=== FATAL ERROR ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: 'Failed to generate analysis',
            details: error.message
        });
    }
};
