// Mock AI Service leveraging Gemini capabilities

export const generateSmartReplies = async (conversationHistory) => {
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock analysis of conversation
    const lastMessage = conversationHistory[conversationHistory.length - 1]?.text?.toLowerCase() || '';

    if (lastMessage.includes('price') || lastMessage.includes('cost')) {
        return [
            "Our pricing starts at $10/month.",
            "Would you like to see our full price list?",
            "It depends on the plan. Basic is free."
        ];
    }

    if (lastMessage.includes('hello') || lastMessage.includes('hi')) {
        return [
            "Hi there! How can I help you?",
            "Hello! Welcome to our support.",
            "Hi! 👋 What brings you here today?"
        ];
    }

    return [
        "I can help with that.",
        "Could you provide more details?",
        "Let me check that for you."
    ];
};

export const summarizeConversation = async (conversationHistory) => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    return "User inquired about pricing and shipping. Agent Sarah provided standard rates. Customer seems interested but hasn't purchased yet.";
};

export const queryKnowledgeBase = async (query) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Mock RAG retrieval
    return {
        answer: "Based on your knowledge base, our refund policy allows returns within 30 days of purchase if the item is unused.",
        source: "Refund_Policy_v2.pdf (Page 3)"
    };
};

export const transcribeAudio = async (audioBlob) => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return "Hi, I clearly want to return this item because it's broken.";
};
