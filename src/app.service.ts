import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
          height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #050505;
          background-image: 
            linear-gradient(rgba(0, 255, 170, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 170, 0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          font-family: 'Segoe UI', Roboto, monospace;
          overflow: hidden;
        }

        .container {
          text-align: center;
        }

        .typewriter {
          color: #00ffaa;
          font-size: 3.5rem;
          font-weight: 900;
          letter-spacing: 2px;
          overflow: hidden; 
          border-right: 4px solid #00ffaa; 
          white-space: nowrap; 
          margin: 0 auto; 
          /* 5s duration for a slightly calmer loop */
          animation: 
            typing 5s steps(25) infinite,
            blink-caret 0.75s step-end infinite;
          text-shadow: 0 0 15px rgba(0, 255, 170, 0.5);
        }

        /* PERFECT LOOP KEYFRAMES */
        @keyframes typing {
          0% { width: 0; }            /* Start empty */
          30% { width: 100%; }        /* Finish typing by 30% */
          80% { width: 100%; }        /* Stay visible until 80% (Reading time) */
          100% { width: 0; }          /* Quickly erase back to 0 */
        }

        @keyframes blink-caret {
          from, to { border-color: transparent }
          50% { border-color: #00ffaa; }
        }

        .status-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          background: #00ffaa;
          border-radius: 50%;
          margin-right: 10px;
          animation: pulse 1.5s infinite;
        }

        .footer-text {
          margin-top: 20px;
          color: rgba(0, 255, 170, 0.4);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 5px;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.4; }
          100% { transform: scale(1); opacity: 1; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="typewriter">Welcome to Backend APIs</div>
        <div class="footer-text">
          <span class="status-dot"></span> Service Cluster: Active
        </div>
      </div>
    </body>
    </html>
    `;
  }
}
