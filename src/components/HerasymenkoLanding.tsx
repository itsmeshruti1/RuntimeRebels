import React, { useEffect, useRef } from 'react';

interface HerasymenkoLandingProps {
  isLanding: boolean;
}

let mainScriptBooted = false;

export const HerasymenkoLanding: React.FC<HerasymenkoLandingProps> = ({ isLanding }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainScriptBooted) {
      mainScriptBooted = true;
      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/js/main.js';
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      data-landing-root=""
      aria-hidden={!isLanding}
      className={isLanding ? 'block' : 'pointer-events-none opacity-0 invisible hidden'}
    >
      <canvas className="orbit" data-orbit=""></canvas>
      <canvas className="gl" data-gl="" data-case-drawer=""></canvas>

      <header className="corner corner--tl blend" data-ui="">
        <a className="brand h3" href="/home" data-home="">
          ReverseResilia
        </a>
        <p className="role mono" data-swap="">
          Supply Chain Recovery Engine
        </p>
      </header>

      <nav className="menu blend" aria-label="Main">
        <span className="ui-mask" data-ui="">
          <span className="ui-in">
            <a className="pill pill--menu is-active" href="/workbench/overview">
              <span className="pill-label">
                <span>Work</span>
                <span className="pill-count">05</span>
              </span>
              <svg className="pill-dot" viewBox="0 0 4 5" aria-hidden="true">
                <path d="M0 0.5H4V4.5H0V0.5Z" />
              </svg>
            </a>
          </span>
        </span>
        <span className="ui-mask" data-ui="">
          <span className="ui-in">
            <a className="pill pill--menu" href="/workbench/overview">
              <span className="pill-label">
                <span>Overview</span>
                <span className="pill-count">01</span>
              </span>
              <svg className="pill-dot" viewBox="0 0 4 5" aria-hidden="true">
                <path d="M0 0.5H4V4.5H0V0.5Z" />
              </svg>
            </a>
          </span>
        </span>
        <span className="ui-mask" data-ui="">
          <span className="ui-in">
            <a className="pill pill--menu" href="/workbench/simulator">
              <span className="pill-label">
                <span>Simulator</span>
                <span className="pill-count">02</span>
              </span>
              <svg className="pill-dot" viewBox="0 0 4 5" aria-hidden="true">
                <path d="M0 0.5H4V4.5H0V0.5Z" />
              </svg>
            </a>
          </span>
        </span>
        <span className="ui-mask" data-ui="">
          <span className="ui-in">
            <a className="pill pill--menu" href="/workbench/planner">
              <span className="pill-label">
                <span>Planner</span>
                <span className="pill-count">03</span>
              </span>
              <svg className="pill-dot" viewBox="0 0 4 5" aria-hidden="true">
                <path d="M0 0.5H4V4.5H0V0.5Z" />
              </svg>
            </a>
          </span>
        </span>
        <span className="ui-mask" data-ui="">
          <span className="ui-in">
            <a className="pill pill--menu" href="/workbench/action-sheet">
              <span className="pill-label">
                <span>Verify</span>
                <span className="pill-count">05</span>
              </span>
              <svg className="pill-dot" viewBox="0 0 4 5" aria-hidden="true">
                <path d="M0 0.5H4V4.5H0V0.5Z" />
              </svg>
            </a>
          </span>
        </span>
      </nav>

      <div className="corner corner--tr view-switch blend h3" data-ui="" data-swap="">
        <button className="view-option is-active" data-view="slider" type="button">
          01
        </button>
        <span className="view-sep" aria-hidden="true">
          ||
        </span>
        <button className="view-option" data-view="gallery" type="button">
          02
        </button>
        <span className="view-sep" aria-hidden="true">
          ||
        </span>
        <button className="view-option" data-view="orbit" type="button">
          03
        </button>
      </div>

      <main className="slides" data-texts="" aria-live="polite"></main>
      <div className="gallery-labels" data-gallery=""></div>

      {/* Accessible DOM Links & High-Resolution City Imagery for the 5 ReverseResilia Corridors */}
      <nav className="sr-only" aria-label="ReverseResilia City Corridors">
        <a href="/home?city=bengaluru&view=overview#bengaluru" data-rr-nav="">
          <img
            src="/media/cities/bengaluru.jpg"
            alt="Bengaluru skyline with Vidhana Soudha, UB City tower, and Cubbon Park canopy"
            width={1408}
            height={792}
          />
          <span>Bengaluru Corridor</span>
        </a>
        <a href="/home?city=mumbai&view=simulator#mumbai" data-rr-nav="">
          <img
            src="/media/cities/mumbai.jpg"
            alt="Mumbai Bandra-Worli Sea Link cable-stayed bridge and South Mumbai skyline at sunset"
            width={1408}
            height={792}
          />
          <span>Mumbai Port Hub</span>
        </a>
        <a href="/home?city=delhi_ncr&view=planner#delhi-ncr" data-rr-nav="">
          <img
            src="/media/cities/delhi-ncr.jpg"
            alt="Delhi NCR India Gate, Lotus Temple, Gurugram Cyber Hub skyline, and elevated metro corridor"
            width={1408}
            height={792}
          />
          <span>Delhi NCR Multi-State</span>
        </a>
        <a href="/home?city=chennai&view=comparison#chennai" data-rr-nav="">
          <img
            src="/media/cities/chennai.jpg"
            alt="Chennai Marina coastline, Napier Bridge arches, Kapaleeshwarar Temple gopuram, and OMR IT skyline"
            width={1408}
            height={792}
          />
          <span>Chennai Coastal Grid</span>
        </a>
        <a href="/home?city=guwahati&view=actionsheet#guwahati" data-rr-nav="">
          <img
            src="/media/cities/guwahati.jpg"
            alt="Guwahati Saraighat Bridge across the Brahmaputra River with Nilachal Hill and Kamakhya Temple"
            width={1408}
            height={792}
          />
          <span>Guwahati Gateway</span>
        </a>
      </nav>

      <div className="landing-action-bar">
        <a
          href="/home"
          data-rr-nav=""
          className="landing-pill-btn"
          title="Enter ReverseResilia Home & Recovery Platform"
          aria-label="Enter ReverseResilia Home (Enter Auren Home)"
        >
          <span>Enter ReverseResilia Home</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      <div className="corner corner--br blend h3 progress" data-stepper="">
        <span data-stepper-current="">01</span>
        <span className="stepper-steps" data-stepper-steps=""></span>
        <span data-stepper-count="">05</span>
      </div>
      <div className="ruler blend" data-ruler="">
        <div className="ruler-track" data-ruler-track=""></div>
      </div>

      <section className="work" data-work="" aria-hidden="true"></section>

      <div className="load" data-load="" aria-hidden="true">
        <div className="load-bg" data-load-bg=""></div>
        <div className="load-no h3">
          <div data-load-no="">0%</div>
        </div>
      </div>
    </div>
  );
};
