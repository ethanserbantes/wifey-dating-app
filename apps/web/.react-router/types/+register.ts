import "react-router";

declare module "react-router" {
  interface Register {
    params: Params;
  }

  interface Future {
    unstable_middleware: false
  }
}

type Params = {
  "/": {};
  "/account/logout": {};
  "/account/signin": {};
  "/account/signup": {};
  "/admin": {};
  "/admin/admins": {};
  "/admin/analytics": {};
  "/admin/change-password": {};
  "/admin/dashboard": {};
  "/admin/engagement": {};
  "/admin/fake-profiles": {};
  "/admin/forgot-password": {};
  "/admin/likes-throttle": {};
  "/admin/quiz-builder": {};
  "/admin/quiz-config": {};
  "/admin/reports": {};
  "/admin/reset-password": {};
  "/admin/support": {};
  "/admin/users": {};
  "/admin/verifications": {};
  "/*?": {};
};