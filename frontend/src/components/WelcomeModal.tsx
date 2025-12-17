import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Coins, ArrowRight } from 'lucide-react';

const ONBOARDING_KEY = 'watmarket_onboarding_complete';

export function useOnboarding() {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setShowWelcome(true);
    }
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowWelcome(false);
  };

  return { showWelcome, completeOnboarding };
}

interface WelcomeModalProps {
  onComplete: () => void;
}

export default function WelcomeModal({ onComplete }: WelcomeModalProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to WatMarket! 🎉",
      content: (
        <>
          <p className="welcome-intro">
            You've been given <strong>10,000 GOOS</strong> (play money) to predict outcomes on questions that matter to you.
          </p>
          <div className="welcome-highlight">
            <Coins size={24} />
            <div>
              <strong>GOOS</strong> is our virtual currency. Use it to place predictions and track your performance.
            </div>
          </div>
        </>
      ),
    },
    {
      title: "How It Works",
      content: (
        <div className="welcome-steps">
          <div className="welcome-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <strong>Find a market</strong>
              <p>Browse questions like "Will it rain tomorrow?" or "Will the project ship on time?"</p>
            </div>
          </div>
          <div className="welcome-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <strong>Make your prediction</strong>
              <p>Buy <span className="yes-text">YES</span> if you think it will happen, <span className="no-text">NO</span> if it won't</p>
            </div>
          </div>
          <div className="welcome-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <strong>Win or learn</strong>
              <p>If you're right, you profit! If not, you learn something about your predictions.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Understanding Prices",
      content: (
        <>
          <p className="welcome-intro">
            The percentage shown is the <strong>market's probability estimate</strong>.
          </p>
          <div className="price-example">
            <div className="price-card yes">
              <span className="price-label">YES</span>
              <span className="price-value">70%</span>
            </div>
            <div className="price-card no">
              <span className="price-label">NO</span>
              <span className="price-value">30%</span>
            </div>
          </div>
          <p className="welcome-explanation">
            If YES is at 70%, the market thinks there's a 70% chance it happens. 
            <br/><br/>
            <strong>Think it's higher?</strong> Buy YES. <strong>Think it's lower?</strong> Buy NO.
          </p>
        </>
      ),
    },
  ];

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div className="modal-overlay">
      <div className="welcome-modal">
        <div className="welcome-header">
          <h2>{currentStep.title}</h2>
          <div className="step-dots">
            {steps.map((_, i) => (
              <div key={i} className={`dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`} />
            ))}
          </div>
        </div>
        
        <div className="welcome-content">
          {currentStep.content}
        </div>

        <div className="welcome-footer">
          {step > 0 && (
            <button className="btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {isLastStep ? (
            <Link to="/markets" className="btn-primary" onClick={onComplete}>
              Start Trading <ArrowRight size={16} />
            </Link>
          ) : (
            <button className="btn-primary" onClick={() => setStep(step + 1)}>
              Next <ArrowRight size={16} />
            </button>
          )}
        </div>

        <button className="welcome-skip" onClick={onComplete}>
          Skip intro
        </button>
      </div>
    </div>
  );
}
