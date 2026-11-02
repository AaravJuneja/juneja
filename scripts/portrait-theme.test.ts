import {describe,expect,test} from "bun:test";
import {applyPortraitTheme,hasPortraitCookie} from "../src/lib/portraitTheme";

describe("portrait theme",()=>{
  test("only the active portrait cookie enables brown mode",()=>{
    for(const cookies of ["portrait=claimed","mirror=cracked; portrait=claimed","other=1;portrait=claimed; more=2"])expect(hasPortraitCookie(cookies)).toBe(true);
    for(const cookies of ["","mirror=cracked","portrait=cleared","notportrait=claimed","portrait=claimed-extra"])expect(hasPortraitCookie(cookies)).toBe(false);
  });
  test("the root theme and browser chrome stay in sync in both directions",()=>{
    const attributes=new Map<string,string>();
    let color="";
    const target={documentElement:{toggleAttribute(name:string,enabled:boolean){if(enabled)attributes.set(name,"");else attributes.delete(name);}},querySelector(){return{setAttribute(_name:string,value:string){color=value;}};}} as unknown as Document;
    applyPortraitTheme(target,true);expect(attributes.has("data-portrait")).toBe(true);expect(color).toBe("#0d0906");
    applyPortraitTheme(target,false);expect(attributes.has("data-portrait")).toBe(false);expect(color).toBe("#0A0710");
  });
});
