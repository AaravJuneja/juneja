import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";

const contact=readFileSync(new URL("../src/components/InlineContact.astro",import.meta.url),"utf8");

test("the correspondence card retains the contact anchor, email and existing social links",()=>{
  expect(contact).toContain('id="contact" aria-labelledby="contact-title"');
  expect(contact).toContain('id="contact-title" tabindex="-1">leave a little hello</h2>');
  expect(contact).not.toContain("↗");
  expect(contact).toContain('href="mailto:aarav.juneja2044@gmail.com"');
  expect(contact).toContain("<SocialLinks />");
  expect(contact).toContain('class="contact-clip" aria-hidden="true"');
  expect(contact).not.toContain("a.j.");
});

test("the mirror centers against the complete home copy column while mobile keeps the contact last",()=>{
  const page=readFileSync(new URL("../src/pages/index.astro",import.meta.url),"utf8");
  const hero=readFileSync(new URL("../src/components/Hero.astro",import.meta.url),"utf8");
  expect(page).toContain('<InlineContact slot="contact" embedded />');
  expect(hero).toContain('<slot name="contact" />');
  expect(hero).toContain('contents lg:flex lg:flex-1 lg:flex-col');
  expect(hero).toContain('id="player-card" class="order-2');
  expect(contact).toContain('embedded?"order-3 w-full"');
});
