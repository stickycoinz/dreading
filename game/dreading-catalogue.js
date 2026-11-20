(function(){'use strict';const C=window.DreadingCatalogue={capacity:30};
  C.presets = {
    marksman: { name: "Marksman (1 unit)", cost: 2, guns: ["svd"] },
    rocketeer: { name: "Bazooka soldier (1 unit)", cost: 2, guns: ["bazooka"] },
    artillery: { name: "Mortar operator (1 unit)", cost: 1, guns: ["m9"] },
    recruits: { name: "Recruits", cost: 4, guns: ["pipe_shotgun", "m4_worn", "ak_rust", "hunting_rifle"] },
    swat: { name: "Retired SWAT", cost: 6, guns: ["rem870", "rem870", "m4", "m4"] },
    elite: { name: "Suppressed specialists", cost: 8, guns: ["m4", "mp5", "m1014", "svd"] },
  };
  C.kits = function (tier) {
    const p = C.presets[tier];
    if (tier === "artillery") return [{name:"MORTAR OPERATOR",cls:"Artillery",clsId:"artillery",primary:"m9",secondary:"m9",attachments:[],secondaryAttachments:[],grenades:{frag:6,smoke:0,flash:0}}];
    if(tier==='marksman'||tier==='rocketeer')return [{name:p.name,cls:tier==='marksman'?'Marksman':'Bazooka soldier',clsId:tier,primary:p.guns[0],secondary:'m9',attachments:tier==='marksman'?DreadingPrep.attachments('svd').filter(a=>a.id==='optic_2_lpvo_scope').map(a=>a.id):[],secondaryAttachments:[],grenades:{frag:2,smoke:0,flash:0}}];
    return p.guns.map((gun, i) => {
      const elite = tier === "elite",
        wanted = elite ? ["suppressor_0_round", i === 3 ? "optic_2_lpvo_scope" : "optic_0_red_dot", "foregrip_1_angled", "light_1_slim_light"] : [];
      const legal = DreadingPrep.attachments(gun);
      return {
        name: p.name.toUpperCase() + " " + (i + 1),
        cls: i === 3 && elite ? "Marksman" : "Scavenger",
        clsId: i === 3 && elite ? "marksman" : "scavenger",
        primary: gun,
        secondary: elite ? "usp" : "m9",
        suppressedPrimary: elite,
        attachments: wanted.filter((id) => legal.some((a) => a.id === id)),
        secondaryAttachments: [],
        grenades: { frag: tier === "recruits" ? 0 : 2, smoke: tier === "recruits" ? 0 : 1, flash: tier === "swat" ? 2 : elite ? 1 : 0 },
      };
    });
  };
})();
