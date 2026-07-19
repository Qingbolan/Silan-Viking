//! Interactive deployment onboarding state.
//!
//! The state machine is intentionally independent from terminal I/O. The CLI
//! adapter owns prompts and side effects; this module makes lifecycle order
//! explicit so future desktop/RPC onboarding can reuse the same semantics.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnboardingFlow {
    QuickStart,
    Advanced,
}

impl OnboardingFlow {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "quickstart" | "quick" => Ok(Self::QuickStart),
            "advanced" | "manual" => Ok(Self::Advanced),
            other => Err(format!(
                "unknown onboarding flow `{other}`; expected quickstart or advanced"
            )),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnboardingState {
    InspectProject,
    PrepareContent,
    ResolveDeployment,
    ResolveCredentials,
    Verify,
    Review,
    Complete,
}

impl OnboardingState {
    pub fn next(self) -> Self {
        match self {
            Self::InspectProject => Self::PrepareContent,
            Self::PrepareContent => Self::ResolveDeployment,
            Self::ResolveDeployment => Self::ResolveCredentials,
            Self::ResolveCredentials => Self::Verify,
            Self::Verify => Self::Review,
            Self::Review => Self::Complete,
            Self::Complete => Self::Complete,
        }
    }
}

pub struct OnboardingSession {
    flow: OnboardingFlow,
    state: OnboardingState,
}

impl OnboardingSession {
    pub fn new(flow: OnboardingFlow) -> Self {
        Self {
            flow,
            state: OnboardingState::InspectProject,
        }
    }

    pub fn flow(&self) -> OnboardingFlow {
        self.flow
    }

    pub fn state(&self) -> OnboardingState {
        self.state
    }

    pub fn advance(&mut self) {
        self.state = self.state.next();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_is_ordered_and_terminal() {
        let mut session = OnboardingSession::new(OnboardingFlow::QuickStart);
        let expected = [
            OnboardingState::InspectProject,
            OnboardingState::PrepareContent,
            OnboardingState::ResolveDeployment,
            OnboardingState::ResolveCredentials,
            OnboardingState::Verify,
            OnboardingState::Review,
            OnboardingState::Complete,
        ];
        for state in expected {
            assert_eq!(session.state(), state);
            session.advance();
        }
        assert_eq!(session.state(), OnboardingState::Complete);
    }
}
