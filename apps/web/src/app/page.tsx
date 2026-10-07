import { redirect } from "next/navigation";

// TODO(auth): signed-out visitors go to the welcome/sign-in flow (App Flow Blueprint, section 3)
// once auth exists. With the placeholder session everyone is signed in.
export default function Root() {
  redirect("/home");
}
