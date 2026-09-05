import { QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { ReaderPage } from "@/pages/ReaderPage";
import { ChatPage } from "@/pages/ChatPage";
import { PrivacyPolicyPage } from "@/pages/PrivacyPolicyPage";
import { TermsOfServicePage } from "@/pages/TermsOfServicePage";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <Switch>
            <Route path="/terms">
              <TermsOfServicePage />
            </Route>
            <Route path="/privacy">
              <PrivacyPolicyPage />
            </Route>
            <Route path="/reader">
              <ReaderPage />
            </Route>
            <Route>
              <ChatPage />
            </Route>
          </Switch>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
