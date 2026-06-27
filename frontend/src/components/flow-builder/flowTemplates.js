const tpl = (value, fields) =>
    String(value || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => fields[key] ?? '');

const node = (id, type, x, y, config = {}) => ({
    id,
    type,
    position: { x, y },
    data: {
        label: config.title || config.label || type,
        config,
        configured: true,
        status: { sent: 0, delivered: 0, subscribers: 0, errors: 0 },
    },
});

const edge = (id, source, target, sourceHandle) => ({
    id,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    type: 'deletable',
});

export const FLOW_TEMPLATE_CATEGORIES = ['All', 'Sales', 'Support', 'Booking', 'Commerce', 'Retention'];

export const FLOW_TEMPLATES = [
    {
        id: 'welcome-lead-capture',
        name: 'Welcome + Lead Capture',
        category: 'Sales',
        difficulty: 'Easy',
        minutes: 5,
        fakeStars: 184,
        description: 'Greet new WhatsApp users, collect their name, then route them to pricing, services, or sales.',
        bestFor: 'Agencies, service businesses, local businesses, SaaS demo leads.',
        fields: [
            { key: 'businessName', label: 'Business name', defaultValue: 'GetAiPilot' },
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'hello' },
            { key: 'serviceName', label: 'Main service', defaultValue: 'WhatsApp automation' },
            { key: 'handoffReason', label: 'Sales handoff reason', defaultValue: 'Lead asked to talk to sales' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword],
            trigger_keywords: [fields.keyword],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: fields.keyword, matchType: 'string', title: 'Welcome Trigger' }),
                node('welcome', 'textMessage', 0, 150, {
                    message: `Hi! Welcome to ${fields.businessName}. We help with ${fields.serviceName}.\n\nWhat should I help you with today?`,
                    typingDisplay: true,
                }),
                node('menu', 'button', 0, 310, {
                    headerText: 'Choose one option:',
                    buttons: [
                        { text: 'Pricing', type: 'reply' },
                        { text: 'Services', type: 'reply' },
                        { text: 'Talk to Sales', type: 'reply' },
                    ],
                }),
                node('pricing', 'textMessage', -320, 500, { message: 'Sure. Our team can share the right plan after understanding your requirement.' }),
                node('services', 'textMessage', 0, 500, { message: `We offer ${fields.serviceName}, onboarding support, and done-for-you setup.` }),
                node('handoff', 'handoff', 320, 500, {
                    reason: fields.handoffReason,
                    message: 'Thanks. I am connecting you with a sales specialist now.',
                }),
                node('end', 'end', 0, 680, { message: 'Thanks for contacting us.' }),
            ],
            edges: [
                edge('e-start-welcome', 'start', 'welcome'),
                edge('e-welcome-menu', 'welcome', 'menu'),
                edge('e-menu-pricing', 'menu', 'pricing', 'button-0'),
                edge('e-menu-services', 'menu', 'services', 'button-1'),
                edge('e-menu-handoff', 'menu', 'handoff', 'button-2'),
                edge('e-pricing-end', 'pricing', 'end'),
                edge('e-services-end', 'services', 'end'),
            ],
        }),
    },
    {
        id: 'pricing-enquiry',
        name: 'Pricing Enquiry Flow',
        category: 'Sales',
        difficulty: 'Easy',
        minutes: 6,
        fakeStars: 151,
        description: 'Answer pricing queries, qualify the buyer, and hand off high-intent leads.',
        bestFor: 'Teams receiving frequent price, cost, plan, or package questions.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'price' },
            { key: 'starterPlan', label: 'Starter plan text', defaultValue: 'Starter: basic automation setup' },
            { key: 'proPlan', label: 'Pro plan text', defaultValue: 'Pro: full WhatsApp funnel + integrations' },
            { key: 'cta', label: 'Sales CTA', defaultValue: 'Would you like our team to suggest the best plan?' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'pricing', 'cost'],
            trigger_keywords: [fields.keyword, 'pricing', 'cost'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, pricing, cost`, matchType: 'string' }),
                node('intro', 'textMessage', 0, 150, { message: `Here are our popular options:\n\n1. ${fields.starterPlan}\n2. ${fields.proPlan}\n\n${fields.cta}` }),
                node('choice', 'button', 0, 330, {
                    headerText: 'What do you want next?',
                    buttons: [
                        { text: 'Suggest Plan', type: 'reply' },
                        { text: 'Talk to Sales', type: 'reply' },
                    ],
                }),
                node('qualify', 'userInput', -220, 520, { question: 'Briefly tell us your requirement or monthly WhatsApp volume.', inputType: 'text', saveToField: 'requirement' }),
                node('sales', 'handoff', 220, 520, { reason: 'Pricing enquiry lead', message: 'Great. Connecting you to sales for pricing help.' }),
                node('end', 'end', -220, 700, { message: 'Thanks. We saved your requirement: {{requirement}}' }),
            ],
            edges: [
                edge('e1', 'start', 'intro'),
                edge('e2', 'intro', 'choice'),
                edge('e3', 'choice', 'qualify', 'button-0'),
                edge('e4', 'choice', 'sales', 'button-1'),
                edge('e5', 'qualify', 'end'),
            ],
        }),
    },
    {
        id: 'support-triage',
        name: 'Support Triage',
        category: 'Support',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 207,
        description: 'Categorize support requests, answer common issues, and escalate urgent cases.',
        bestFor: 'Support teams that need clean routing before human handoff.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'support' },
            { key: 'billingReply', label: 'Billing reply', defaultValue: 'Please share your registered phone/email and invoice number.' },
            { key: 'technicalReply', label: 'Technical reply', defaultValue: 'Please describe the issue and attach a screenshot if possible.' },
            { key: 'urgentReason', label: 'Urgent handoff reason', defaultValue: 'Customer selected urgent support' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'help', 'issue'],
            trigger_keywords: [fields.keyword, 'help', 'issue'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, help, issue`, matchType: 'string' }),
                node('menu', 'button', 0, 160, {
                    headerText: 'What kind of support do you need?',
                    buttons: [
                        { text: 'Billing', type: 'reply' },
                        { text: 'Technical', type: 'reply' },
                        { text: 'Urgent', type: 'reply' },
                    ],
                }),
                node('billing', 'textMessage', -340, 350, { message: fields.billingReply }),
                node('technical', 'userInput', 0, 350, { question: fields.technicalReply, inputType: 'text', saveToField: 'support_issue' }),
                node('urgent', 'handoff', 340, 350, { reason: fields.urgentReason, message: 'I am escalating this to the team now.' }),
                node('end', 'end', 0, 560, { message: 'Support request recorded. Our team will help you shortly.' }),
            ],
            edges: [
                edge('e1', 'start', 'menu'),
                edge('e2', 'menu', 'billing', 'button-0'),
                edge('e3', 'menu', 'technical', 'button-1'),
                edge('e4', 'menu', 'urgent', 'button-2'),
                edge('e5', 'billing', 'end'),
                edge('e6', 'technical', 'end'),
            ],
        }),
    },
    {
        id: 'appointment-booking',
        name: 'Appointment Booking',
        category: 'Booking',
        difficulty: 'Medium',
        minutes: 8,
        fakeStars: 126,
        description: 'Collect customer details and preferred time for demos, consultations, or visits.',
        bestFor: 'Clinics, salons, consultants, agencies, and field service teams.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'book' },
            { key: 'appointmentType', label: 'Appointment type', defaultValue: 'consultation' },
            { key: 'hours', label: 'Working hours', defaultValue: '10 AM to 6 PM, Monday to Saturday' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'appointment', 'demo'],
            trigger_keywords: [fields.keyword, 'appointment', 'demo'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, appointment, demo`, matchType: 'string' }),
                node('name', 'userInput', 0, 150, { question: `Sure, I can help book a ${fields.appointmentType}. What is your name?`, inputType: 'text', saveToField: 'name' }),
                node('slot', 'userInput', 0, 330, { question: `Thanks {{name}}. Please share your preferred date/time. We are available ${fields.hours}.`, inputType: 'text', saveToField: 'preferred_slot' }),
                node('confirm', 'textMessage', 0, 510, { message: 'Thanks {{name}}. Your preferred slot is {{preferred_slot}}. Our team will confirm availability shortly.' }),
                node('handoff', 'handoff', 0, 680, { reason: 'Appointment booking request', message: 'I am sending this booking request to the team.' }),
            ],
            edges: [
                edge('e1', 'start', 'name'),
                edge('e2', 'name', 'slot'),
                edge('e3', 'slot', 'confirm'),
                edge('e4', 'confirm', 'handoff'),
            ],
        }),
    },
    {
        id: 'faq-intake-handoff',
        name: 'FAQ Intake + Human Handoff',
        category: 'Support',
        difficulty: 'Medium',
        minutes: 7,
        fakeStars: 173,
        description: 'Capture customer questions, provide a helpful first response, and route complex cases to a human.',
        bestFor: 'Businesses with FAQs, product knowledge, policies, or support documentation.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'ask' },
            { key: 'firstReply', label: 'First response', defaultValue: 'Thanks for sharing your question. I will help route this correctly.' },
            { key: 'fallbackMessage', label: 'Human handoff message', defaultValue: 'I will connect you with a team member for this.' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'question', 'help'],
            trigger_keywords: [fields.keyword, 'question', 'help'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, question, help`, matchType: 'string' }),
                node('question', 'userInput', 0, 150, { question: 'Please type your question in one message.', inputType: 'text', saveToField: 'customer_question' }),
                node('reply', 'textMessage', 0, 330, { message: `${fields.firstReply}\n\nYour question: {{customer_question}}` }),
                node('choice', 'button', 0, 500, {
                    headerText: 'Was this helpful?',
                    buttons: [
                        { text: 'Yes', type: 'reply' },
                        { text: 'Need Human', type: 'reply' },
                    ],
                }),
                node('end', 'end', -220, 680, { message: 'Glad I could help.' }),
                node('handoff', 'handoff', 220, 680, { reason: 'FAQ handoff requested', message: fields.fallbackMessage }),
            ],
            edges: [
                edge('e1', 'start', 'question'),
                edge('e2', 'question', 'reply'),
                edge('e3', 'reply', 'choice'),
                edge('e4', 'choice', 'end', 'button-0'),
                edge('e5', 'choice', 'handoff', 'button-1'),
            ],
        }),
    },
    {
        id: 'feedback-rating',
        name: 'Feedback + Rating',
        category: 'Retention',
        difficulty: 'Easy',
        minutes: 5,
        fakeStars: 98,
        description: 'Collect customer rating and comments after delivery, service, or support.',
        bestFor: 'Any team wanting feedback loops and service quality tracking.',
        fields: [
            { key: 'keyword', label: 'Trigger keyword', defaultValue: 'feedback' },
            { key: 'brandName', label: 'Brand name', defaultValue: 'our team' },
        ],
        build: (fields) => ({
            triggers: [fields.keyword, 'rating'],
            trigger_keywords: [fields.keyword, 'rating'],
            nodes: [
                node('start', 'startBotFlow', 0, 0, { keywords: `${fields.keyword}, rating`, matchType: 'string' }),
                node('rating', 'button', 0, 160, {
                    headerText: `How was your experience with ${fields.brandName}?`,
                    buttons: [
                        { text: 'Good', type: 'reply' },
                        { text: 'Average', type: 'reply' },
                        { text: 'Poor', type: 'reply' },
                    ],
                }),
                node('comment', 'userInput', 0, 350, { question: 'Please share one short comment so we can improve.', inputType: 'text', saveToField: 'feedback_comment' }),
                node('thanks', 'end', 0, 540, { message: 'Thank you for your feedback.' }),
            ],
            edges: [
                edge('e1', 'start', 'rating'),
                edge('e2', 'rating', 'comment', 'button-0'),
                edge('e3', 'rating', 'comment', 'button-1'),
                edge('e4', 'rating', 'comment', 'button-2'),
                edge('e5', 'comment', 'thanks'),
            ],
        }),
    },
].map(template => ({
    ...template,
    preview: template.build(Object.fromEntries(template.fields.map(field => [field.key, field.defaultValue]))),
}));

export function buildFlowFromTemplate(template, values = {}) {
    const fields = Object.fromEntries(template.fields.map(field => [field.key, values[field.key] || field.defaultValue || '']));
    const built = template.build(fields);
    const keyword = built.trigger_keywords?.[0] || fields.keyword || template.name.toLowerCase().split(/\s+/)[0];

    return {
        name: `${template.name}`,
        description: tpl(template.description, fields),
        status: 'draft',
        trigger_type: 'keyword',
        trigger_keywords: built.trigger_keywords || [keyword],
        triggers: built.triggers || [keyword],
        nodes: built.nodes,
        edges: built.edges,
    };
}
