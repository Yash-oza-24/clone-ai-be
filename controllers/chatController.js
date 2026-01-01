const Groq = require('groq-sdk');
const Conversation = require('../models/Conversation');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ═══════════════════════════════════════════════════════════════
// Silent Prompt Enhancement Function (Backend Only)
// ═══════════════════════════════════════════════════════════════
const enhancePrompt = async (userMessage) => {
  try {
    const enhancementPrompt = [
      {
        role: 'system',
        content: `You are a prompt enhancement expert. Your job is to take a user's query and make it more detailed, clear, and effective for getting the best AI response. 

Rules:
- Keep the original intent and meaning
- Add relevant context and specificity
- Make it more structured if needed
- Don't change the core question
- Keep it concise but detailed (max 2-3 sentences)
- Return ONLY the enhanced prompt, nothing else
- Don't add explanations or meta-commentary
- If the prompt is already clear and detailed, return it as is
- DON'T make it overly verbose`
      },
      {
        role: 'user',
        content: `Enhance this prompt concisely:\n\n"${userMessage}"`
      }
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: enhancementPrompt,
      temperature: 0.3,  // Lower temperature for more focused enhancement
      max_tokens: 200,   // Reduced from 500
      top_p: 0.9,
      stream: false
    });

    const enhancedPrompt = completion.choices[0].message.content.trim();
      
    return enhancedPrompt;

  } catch (error) {
    console.error('⚠️ Prompt enhancement failed, using original:', error.message);
    // If enhancement fails, return original message
    return userMessage;
  }
};

// ═══════════════════════════════════════════════════════════════
// Main Send Message Function (User doesn't know about enhancement)
// ═══════════════════════════════════════════════════════════════
exports.sendMessage = async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Find or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }
    } else {
      conversation = new Conversation({
        title: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      });
    }

    // **STEP 1: Silently enhance the prompt in the background**
    const enhancedMessage = await enhancePrompt(message);

    // **STEP 2: Store the ORIGINAL user message (user sees what they typed)**
    conversation.messages.push({
      role: 'user',
      content: message  // Store original message
    });

    // **STEP 3: Build conversation history**
    // For previous messages, use their original content
    // For the CURRENT message, use the ENHANCED version
    const messagesForAI = [
      {
        role: 'system',
        content: `You are a helpful AI assistant. Provide clear, concise, and well-structured responses.

Response Guidelines:
- Be direct and to the point
- Use bullet points or numbered lists when appropriate
- Keep explanations concise but complete
- Avoid unnecessary verbosity
- Focus on answering the question directly
- Use examples only when they add significant value
- Break down complex topics into digestible sections
- Aim for clarity over comprehensiveness`
      }
    ];
    
    // Add all previous messages as-is
    for (let i = 0; i < conversation.messages.length - 1; i++) {
      messagesForAI.push({
        role: conversation.messages[i].role === 'assistant' ? 'assistant' : 'user',
        content: conversation.messages[i].content
      });
    }
    
    // Add the CURRENT message as ENHANCED (silently)
    messagesForAI.push({
      role: 'user',
      content: enhancedMessage  // Use enhanced version for AI
    });

    // **STEP 4: Generate response with Groq using ENHANCED prompt**
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messagesForAI,
      temperature: 0.7,
      max_tokens: 1024,  // Reduced from 2048 for more concise responses
      top_p: 0.95,
      stream: false
    });

    const aiResponse = completion.choices[0].message.content;

    // Add AI response
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse
    });

    conversation.updatedAt = Date.now();
    await conversation.save();

    // **STEP 5: Send response (user never knows about enhancement)**
    res.json({
      success: true,
      conversationId: conversation._id,
      message: aiResponse,
      conversation: conversation
      // No mention of prompt enhancement to the user
    });

  } catch (error) {
    
    let errorMessage = 'An error occurred while processing your request';
    
    if (error.message?.includes('api_key')) {
      errorMessage = 'Invalid Groq API key. Please check your .env file';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};