export const swaggerCustomCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  
  /* Reset and Base */
  .swagger-ui {
    font-family: 'Inter', sans-serif !important;
    background-color: #0b0e14 !important; /* Deep Midnight */
    padding-bottom: 50px;
  }

  .swagger-ui .topbar { display: none }

  /* Smooth Information Header */
  .swagger-ui .info { 
    margin: 50px 0 !important; 
    padding: 0 20px;
  }
  .swagger-ui .info .title { 
    color: #f8fafc !important; 
    font-size: 38px; 
    font-weight: 800; 
    letter-spacing: -1px;
  }
  .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info a { 
    color: #94a3b8 !important; 
    font-size: 15px;
    line-height: 1.6;
  }

  /* Sticky Scheme & Auth Bar */
  .swagger-ui .scheme-container {
    background-color: #111827 !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
    border-top: 1px solid #1e293b !important;
    border-bottom: 1px solid #1e293b !important;
    padding: 20px 0 !important;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  /* Search/Filter Bar - Modern Glassmorphism */
  .swagger-ui .filter-container .operation-filter-input {
    background: #1e293b !important;
    border: 1px solid #334155 !important;
    color: #bdc1c5 !important;
    border-radius: 10px !important;
    padding: 12px 20px !important;
    font-size: 14px !important;
    outline: none !important;
  }

  /* Operation Blocks (The Routes) */
  .swagger-ui .opblock {
    border: 1px solid #1e293b !important;
    border-radius: 12px !important;
    background: #111827 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    margin-bottom: 16px !important;
    overflow: hidden;
  }
  .swagger-ui .opblock:hover { 
    transform: scale(1.01); 
    border-color: #3b82f6 !important;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4) !important;
  }

  /* Method Badges - Soft Neons */
  .swagger-ui .opblock .opblock-summary-method {
    border-radius: 6px !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-weight: 600 !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    padding: 6px 12px !important;
  }

  .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #3b82f6 !important; }
  .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #10b981 !important; }
  .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #f59e0b !important; }
  .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #ef4444 !important; }

  /* Typography within Routes */
  .swagger-ui .opblock .opblock-summary-path { 
    color: #f1f5f9 !important; 
    font-size: 16px !important;
    font-family: 'JetBrains Mono', monospace !important;
  }
  .swagger-ui .opblock .opblock-summary-description { 
    color: #64748b !important; 
    font-size: 13px !important;
  }

  /* Buttons - Clean Minimalist */
  .swagger-ui .btn.authorize {
    background-color: #3b82f6 !important;
    color: #48ff00 !important;
    border: none !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    transition: background 0.2s;
  }
  .swagger-ui .btn.authorize:hover { background-color: #2563eb !important; }
  .swagger-ui .btn.authorize svg { fill: #ffffff !important; }

  /* Tables & Parameters */
  .swagger-ui .opblock-section-header {
    background: transparent !important;
    border-bottom: 1px solid #1e293b !important;
  }
  .swagger-ui table thead tr td, .swagger-ui table thead tr th {
    color: #687e9c !important;
    border-bottom: 1px solid #1e293b !important;
  }
  
  /* Response Code Blocks */
  .swagger-ui .opblock-body pre.microlight {
    background: #0f172a !important;
    border: 1px solid #1e293b !important;
    border-radius: 10px !important;
    padding: 20px !important;
  }

  /* Models Section */
  .swagger-ui section.models { 
    border: 1px solid #1e293b !important; 
    border-radius: 12px !important; 
    background: #0f172a !important;
  }
  .swagger-ui section.models h4 { color: #475569 !important; }
  .swagger-ui .model-box { background: transparent !important; }
`;