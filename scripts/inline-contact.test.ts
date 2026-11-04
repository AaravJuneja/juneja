import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";

const contact=readFileSync(new URL("../src/components/InlineContact.astro",import.meta.url),"utf8");

test("the correspondence card retains the contact anchor, email and existing social links",()=>{
  expect(contact).toContain('id="contact" aria-labelledby="contact-title"');
  expect(contact).toContain('id="contact-title" tabindex="-1">leave a little hello.</h2>');
  expect(contact).toContain('href="mailto:aarav.juneja2044@gmail.com"');
  expect(contact).toContain("<SocialLinks />");
  expect(contact).toContain('class="contact-clip" aria-hidden="true"');
  expect(contact).not.toContain("a.j.");
});
