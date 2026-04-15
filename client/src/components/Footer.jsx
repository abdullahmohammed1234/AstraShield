const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-deep-space/80 backdrop-blur-md border-t border-glass-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-cyan to-cosmic-blue flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-orbitron text-sm font-bold text-white tracking-wider">
              ASTRA<span className="text-neon-cyan">SHIELD</span>
            </span>
          </div>

          <div className="text-center md:text-left">
            <p className="text-sm text-white/60">
              © {currentYear} AstraShield. All rights reserved.
            </p>
            <p className="text-xs text-white/40 mt-1">
              Advanced Space Situational Awareness & Collision Prevention System
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <a
              href="/dashboard"
              className="text-sm text-white/60 hover:text-neon-cyan transition-colors"
            >
              Dashboard
            </a>
            <span className="text-white/20">|</span>
            <a
              href="/alerts"
              className="text-sm text-white/60 hover:text-neon-cyan transition-colors"
            >
              Alerts
            </a>
            <span className="text-white/20">|</span>
            <a
              href="/analytics"
              className="text-sm text-white/60 hover:text-neon-cyan transition-colors"
            >
              Analytics
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
