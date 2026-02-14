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
    // Skip enhancement for simple greetings and casual messages
    const simpleGreetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'bye', 'goodbye', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no'];
    const lowerMessage = userMessage.toLowerCase().trim();
    
    // Don't enhance simple greetings or very short messages
    if (simpleGreetings.includes(lowerMessage) || lowerMessage.length < 10) {
      return userMessage;
    }

    const enhancementPrompt = [
      {
        role: 'system',
        content: `You are a prompt clarity expert. Make unclear prompts clearer ONLY if needed.

Rules:
- If the prompt is already clear, return it EXACTLY as is
- Only enhance if the prompt is vague or ambiguous
- Keep enhancements minimal and natural
- Never make simple questions complex
- Return ONLY the prompt text, no explanations`
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: enhancementPrompt,
      temperature: 0.1,  // Very low for minimal changes
      max_tokens: 150,
      top_p: 0.9,
      stream: false
    });

    const enhancedPrompt = completion.choices[0].message.content.trim();
    
    // If the enhancement made it significantly longer, use original
    if (enhancedPrompt.length > userMessage.length * 2) {
      return userMessage;
    }
      
    return enhancedPrompt;

  } catch (error) {
    console.error('⚠️ Prompt enhancement failed, using original:', error.message);
    return userMessage;
  }
};

// ═══════════════════════════════════════════════════════════════
// Response Type Detector
// ═══════════════════════════════════════════════════════════════
const getResponseType = (message) => {
  const lowerMessage = message.toLowerCase().trim();
  
  // Greetings
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|greetings)[\s!?]*$/i.test(lowerMessage)) {
    return 'greeting';
  }
  
  // Farewells
  if (/^(bye|goodbye|see you|farewell|take care)[\s!?]*$/i.test(lowerMessage)) {
    return 'farewell';
  }
  
  // Thanks
  if (/^(thanks|thank you|thx|ty)[\s!?]*$/i.test(lowerMessage)) {
    return 'thanks';
  }
  
  // Simple acknowledgments
  if (/^(ok|okay|sure|yes|no|alright|got it)[\s!?]*$/i.test(lowerMessage)) {
    return 'acknowledgment';
  }
  
  // Questions
  if (lowerMessage.includes('?') || lowerMessage.startsWith('what') || lowerMessage.startsWith('how') || 
      lowerMessage.startsWith('why') || lowerMessage.startsWith('when') || lowerMessage.startsWith('where') ||
      lowerMessage.startsWith('who') || lowerMessage.startsWith('can') || lowerMessage.startsWith('should')) {
    return 'question';
  }
  
  return 'general';
};

// ═══════════════════════════════════════════════════════════════
// Main Send Message Function
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

    // Detect message type
    const messageType = getResponseType(message);
    
    // Silently enhance the prompt (skip for simple messages)
    const enhancedMessage = ['greeting', 'farewell', 'thanks', 'acknowledgment'].includes(messageType) 
      ? message 
      : await enhancePrompt(message);

    // Store the ORIGINAL user message
    conversation.messages.push({
      role: 'user',
      content: message
    });

    // Build conversation history
    const messagesForAI = [
      {
        role: 'system',
        content: `You are a helpful, friendly, and concise AI assistant similar to ChatGPT or Claude.

CRITICAL RESPONSE RULES:

For greetings (hi, hello, hey):
- Respond with a SHORT, friendly greeting (5-15 words max)
- Example: "Hello! How can I help you today?"
- NEVER write paragraphs for simple greetings

For farewells (bye, goodbye):
- Respond briefly (5-10 words)
- Example: "Goodbye! Have a great day!"

For thanks:
- Respond briefly and warmly (5-10 words)
- Example: "You're welcome! Happy to help!"

For questions and requests:
- Be direct and conversational
- Start with the answer, then provide context if needed
- Use bullet points for lists
- Keep paragraphs short (2-3 sentences max)
- Avoid over-explaining unless asked
- Match the user's tone (casual/formal)

General guidelines:
- Write like a helpful human, not a robot
- Be concise - prefer clarity over completeness
- Only provide examples when specifically helpful
- Don't repeat the question in your answer
- Don't use phrases like "I'd be happy to help" repeatedly
- Get straight to the point

Remember: Users prefer quick, clear answers over lengthy explanations.`
      }
    ];
    
    // Add conversation history
    for (let i = 0; i < conversation.messages.length - 1; i++) {
      messagesForAI.push({
        role: conversation.messages[i].role === 'assistant' ? 'assistant' : 'user',
        content: conversation.messages[i].content
      });
    }
    
    // Add current message (enhanced version for complex queries)
    messagesForAI.push({
      role: 'user',
      content: enhancedMessage
    });

    // Adjust parameters based on message type
    const modelParams = {
      model: 'llama-3.3-70b-versatile',
      messages: messagesForAI,
      stream: false
    };

    // Adjust parameters based on message type
    switch(messageType) {
      case 'greeting':
      case 'farewell':
      case 'thanks':
      case 'acknowledgment':
        modelParams.temperature = 0.3;
        modelParams.max_tokens = 50; // Very short responses
        modelParams.top_p = 0.9;
        break;
      case 'question':
        modelParams.temperature = 0.6;
        modelParams.max_tokens = 500; // Medium responses
        modelParams.top_p = 0.9;
        break;
      default:
        modelParams.temperature = 0.7;
        modelParams.max_tokens = 800; // Standard responses
        modelParams.top_p = 0.95;
        break;
    }

    // Generate response with Groq
    const completion = await groq.chat.completions.create(modelParams);

    let aiResponse = completion.choices[0].message.content;

    // Post-process response for greetings to ensure brevity
    if (messageType === 'greeting' && aiResponse.length > 100) {
      // If the model still gave a long response for a greeting, truncate it
      const firstSentence = aiResponse.split(/[.!?]/)[0];
      aiResponse = firstSentence + '! How can I help you today?';
    }

    // Add AI response
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse
    });

    conversation.updatedAt = Date.now();
    await conversation.save();

    // Send response
    res.json({
      success: true,
      conversationId: conversation._id,
      message: aiResponse,
      conversation: conversation
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